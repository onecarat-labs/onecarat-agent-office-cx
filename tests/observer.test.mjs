import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createSession,project,publicSession } from '../observer/model.mjs';
import { Watcher } from '../observer/watcher.mjs';
const now=Date.now(), rec=(type,payload,time=now)=>({timestamp:new Date(time).toISOString(),type,payload});
const event=(type,extra={},time=now)=>rec('event_msg',{type,turn_id:'turn1',...extra},time);
test('lifecycle is based on explicit terminal event; assistant and tool output are not completion',()=>{
  const s=createSession('s1');project(s,event('task_started'));project(s,rec('response_item',{type:'function_call_output',output:'SECRET'}));assert.equal(s.activity,'working');
  project(s,rec('response_item',{type:'message',role:'assistant',content:'SECRET'}));assert.equal(s.activity,'reporting');
  project(s,event('task_complete'));assert.equal(s.activity,'finished');assert.equal(JSON.stringify(s).includes('SECRET'),false);
  project(s,event('task_started'));assert.equal(s.activity,'finished');project(s,event('task_started',{turn_id:'turn2'},now+1));assert.equal(s.activity,'working');
  project(s,event('task_complete',{},now+2));assert.equal(s.activity,'working');
});
test('does not equate silence, unknown event, or approval settings to approval',()=>{
  const s=createSession('s1');project(s,event('task_started'));project(s,rec('turn_context',{approval_policy:'on-request'}));project(s,event('something_unknown'));
  assert.equal(s.activity,'working');assert.equal(publicSession(s,now+16000).fresh,false);
  project(s,event('exec_approval_request'));assert.equal(s.activity,'approval');project(s,event('exec_command_begin'));assert.equal(s.activity,'running');
});
test('metadata only links explicit parent; malicious labels and arbitrary fields never cross projection',()=>{
  const s=createSession('fallback');project(s,rec('session_meta',{id:'s1',cwd:'SECRET',source:{subagent:{thread_spawn:{parent_thread_id:'parent1'}}},cli_version:'0.169.0',base_instructions:'SECRET'}));
  assert.equal(s.parent,'parent1');assert.equal(s.id,'s1');project(s,rec('response_item',{type:'custom_tool_call',name:'exec',input:'SECRET tools.apply_patch()'}));assert.equal(s.activity,'tool');assert.equal(JSON.stringify(publicSession(s,now)).includes('SECRET'),false);
});
test('item activity, interruption, out of order and corrupt records',()=>{
  const s=createSession('s');for(const [type,activity]of Object.entries({CommandExecution:'running',FileChange:'editing',Reasoning:'thinking',ImageView:'reading'})){project(s,event('item_completed',{item:{type}}));assert.equal(s.activity,activity);}
  project(s,event('turn_aborted'));assert.equal(s.activity,'interrupted');project(s,event('task_started',{turn_id:'other'},now-1));assert.equal(s.activity,'interrupted');
  for(const r of [null,{},[],{payload:1},rec('wat',{})])assert.doesNotThrow(()=>project(s,r));
});
async function fixture(t){await mkdir('.cx/observer-tests',{recursive:true});const root=await mkdtemp(resolve('.cx/observer-tests/run-'));t.after(()=>rm(root,{recursive:true,force:true}));const dir=join(root,'2026','11','21');await mkdir(dir,{recursive:true});return {root,path:join(dir,'rollout-test-11111111-1111-1111-1111-111111111111.jsonl')};}
const line=r=>JSON.stringify(r)+'\n';
test('read-only tail follows append, split UTF8/JSON, deletion and recovery without changing file',async t=>{
  const f=await fixture(t);let clock=Date.now();const w=new Watcher(f.root,{now:()=>clock});
  await writeFile(f.path,line(rec('session_meta',{id:'s1'}))+line(event('task_started')));assert.equal((await w.tick()).sessions[0].activity,'working');
  const edit=Buffer.from(line(event('item_completed',{item:{type:'FileChange',content:'秘密'}}))),split=edit.indexOf(Buffer.from('秘密'))+1;await appendFile(f.path,edit.subarray(0,split));assert.equal((await w.tick()).sessions[0].activity,'working');await appendFile(f.path,edit.subarray(split));assert.equal((await w.tick()).sessions[0].activity,'editing');
  await appendFile(f.path,line(event('task_complete')));assert.equal((await w.tick()).sessions[0].activity,'finished');
  await rm(f.path);clock+=4000;assert.equal((await w.tick()).sessions.length,0);
  await writeFile(f.path,line(rec('session_meta',{id:'new'}))+line(event('task_started')));clock+=4000;assert.equal((await w.tick()).sessions[0].id,'new');
});
test('truncation resets lifecycle, malformed and oversized lines recover',async t=>{
  const f=await fixture(t),w=new Watcher(f.root);await writeFile(f.path,line(rec('session_meta',{id:'s1'}))+line(event('task_complete')));await w.tick();
  await writeFile(f.path,line(event('task_started')));assert.equal((await w.tick()).sessions[0].activity,'working');
  await appendFile(f.path,'malformed\n'+JSON.stringify({secret:'x'.repeat(600000)})+'\n'+line(event('turn_aborted')));await w.tick();const state=await w.tick();assert.equal(state.sessions[0].activity,'interrupted');assert.equal(JSON.stringify(state).includes('secret'),false);
});
test('large initial file reads prefix and bounded tail; missing source is visible',async t=>{
  const f=await fixture(t),w=new Watcher(f.root);await writeFile(f.path,line(rec('session_meta',{id:'large'}))+(' '.repeat(100)+'\n').repeat(12000)+line(event('task_complete')));
  const state=await w.tick();assert.equal(state.sessions[0].id,'large');assert.equal(state.sessions[0].activity,'finished');
  assert.equal((await new Watcher(join(f.root,'absent')).tick()).status,'missing');
});
test('unknown and content-heavy events cannot forge activities by mentioning tool names',()=>{
  const s=createSession('s');project(s,event('task_started'));project(s,rec('response_item',{type:'message',role:'user',content:'task_complete exec_approval_request'}));assert.equal(s.activity,'working');
  project(s,rec('response_item',{type:'custom_tool_call',name:'exec',input:'apply_patch spawn_agent'}));assert.equal(s.activity,'tool');assert.equal(s.parent,'');
});
test('foreign thread and future timestamps never appear as current activity',()=>{
  const s=createSession('s');project(s,event('task_started'));project(s,event('item_completed',{thread_id:'foreign',item:{type:'FileChange'}}));assert.equal(s.activity,'working');
  project(s,event('item_completed',{item:{type:'FileChange'}},now+100000));assert.equal(publicSession(s,now).fresh,false);
});
test('observer keeps source bytes intact and bounds sessions; root sorts ahead of child',async t=>{
  const f=await fixture(t),text=line(rec('session_meta',{id:'root'}))+line(event('task_started'));await writeFile(f.path,text);
  await writeFile(join(f.root,'rollout-child.jsonl'),line(rec('session_meta',{id:'child',source:{subagent:{thread_spawn:{parent_thread_id:'root'}}}}))+line(event('task_started')));
  const w=new Watcher(f.root,{limit:2});let state=await w.tick();assert.equal(state.sessions[0].id,'root');assert.equal(state.sessions[1].parent,'root');assert.equal(await readFile(f.path,'utf8'),text);
  state=await new Watcher(f.root,{limit:1}).tick();assert.equal(state.sessions.length,1);assert.equal(state.skipped,1);
});
