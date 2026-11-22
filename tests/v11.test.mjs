import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {currentThread,resolveLog} from '../observer/binding.mjs';
import {createV11,projectV11,viewV11} from '../observer/model-v11.mjs';
const id='11111111-1111-1111-1111-111111111111',child='22222222-2222-2222-2222-222222222222';
const at=Date.now(),r=(type,payload,time=at)=>({type,payload,timestamp:new Date(time).toISOString()}),ev=(type,extra={},time=at)=>r('event_msg',{type,turn_id:'turn1',...extra},time);
function session(){const s=createV11(id);projectV11(s,r('session_meta',{id}));projectV11(s,ev('task_started'));return s;}
test('binding uses thread only, not shared session ID; no newest fallback',()=>{
 assert.equal(currentThread({CODEX_THREAD_ID:child,CODEX_SESSION_ID:id}),child);
 assert.throws(()=>currentThread({CODEX_SESSION_ID:id}),/NO_THREAD/);
 assert.throws(()=>currentThread({CODEX_THREAD_ID:'../../secret'}),/NO_THREAD/);
});
test('project skill has valid simple frontmatter and routes to the verified launcher',async()=>{
 const text=await readFile('skills/office-cx/SKILL.md','utf8');const m=/^---\r?\nname: ([a-z0-9-]{1,64})\r?\ndescription: ([^\r\n]+)\r?\n---/.exec(text);
 assert.ok(m);assert.equal(m[1],'office-cx');assert.ok(m[2].length<1024&&!/[<>]/.test(m[2]));assert.ok(!text.includes('[TODO:'));
 assert.ok(text.includes('scripts/launch-office.mjs'));assert.ok(text.includes('Do not substitute `CODEX_SESSION_ID`'));assert.ok((await readFile('AGENTS.md','utf8')).includes('skills/office-cx/SKILL.md'));
});
async function fixture(t){await mkdir('.cx/v11-tests',{recursive:true});const root=await mkdtemp(resolve('.cx/v11-tests/run-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const line=x=>JSON.stringify(x)+'\n';
test('matching filename AND metadata are required, and duplicates fail closed',async t=>{
 const root=await fixture(t),path=join(root,'rollout-test-'+id+'.jsonl');await writeFile(path,line(r('session_meta',{id})));assert.equal(await resolveLog(root,id),path);
 await writeFile(path,line(r('session_meta',{id:child})));await assert.rejects(resolveLog(root,id),/IDENTITY_MISMATCH/);
 await writeFile(path,line(r('session_meta',{id})));await writeFile(join(root,'rollout-copy-'+id+'.jsonl'),line(r('session_meta',{id})));await assert.rejects(resolveLog(root,id),/AMBIGUOUS/);
});
test('approval remains unresolved after freshness timeout; unrelated events do not clear it',()=>{
 const s=session();projectV11(s,ev('exec_approval_request',{call_id:'call1'},at+1));
 assert.equal(viewV11(s,at+20000).approval,'uncertain');
 projectV11(s,r('response_item',{type:'message',role:'assistant',content:'SECRET'},at+2));
 projectV11(s,ev('exec_command_begin',{call_id:'other'},at+3));assert.ok(s.approval);
 projectV11(s,ev('exec_command_begin',{call_id:'call1'},at+4));assert.equal(s.approval,null);
});
test('approval is resolved only by same turn completion or a new identified turn, never old turn',()=>{
 for(const terminal of ['task_complete','turn_aborted']){const s=session();projectV11(s,ev('apply_patch_approval_request',{call_id:'p'}));projectV11(s,ev(terminal,{turn_id:'old'},at+1));assert.ok(s.approval);projectV11(s,ev(terminal,{},at+2));assert.equal(s.approval,null);}
 const s=session();projectV11(s,ev('exec_approval_request',{call_id:'c'}));projectV11(s,ev('task_started',{turn_id:'turn2'},at+1));assert.equal(s.approval,null);
});
test('resolving one parallel approval leaves the other request visible',()=>{
 const s=session();projectV11(s,ev('exec_approval_request',{call_id:'a'},at+1));projectV11(s,ev('exec_approval_request',{call_id:'b'},at+2));
 projectV11(s,ev('exec_command_begin',{call_id:'b'},at+3));assert.equal(s.approval.call,'a');assert.equal(viewV11(s,at+20000).approval,'uncertain');
});
test('explicit SubAgentActivity records add and end children without treating child turn end as exit',()=>{
 const s=session();projectV11(s,ev('item_completed',{item:{type:'SubAgentActivity',kind:'started',agent_thread_id:child,agent_path:'/root/child',prompt:'SECRET'}}));assert.equal(s.children.get(child).activity,'arrived');
 projectV11(s,ev('item_completed',{item:{type:'SubAgentActivity',kind:'completed',agent_thread_id:child}},at+1));assert.equal(s.children.get(child).ended,true);
 assert.equal(JSON.stringify(viewV11(s,at)).includes('SECRET'),false);
});
test('session end and turn end are distinct; unverified identity and foreign thread cannot animate',()=>{
 const s=createV11(id);projectV11(s,ev('task_started'));assert.equal(s.activity,'unknown');
 projectV11(s,r('session_meta',{id}));projectV11(s,ev('task_started'));projectV11(s,ev('task_complete'));assert.equal(s.sessionEnded,false);
 projectV11(s,ev('session_end',{thread_id:child},at+1));assert.equal(s.sessionEnded,false);
 projectV11(s,ev('session_end',{thread_id:id},at+2));assert.equal(s.sessionEnded,true);
});
test('assignment animation requires explicit start evidence, preserving its timestamp through later activity',()=>{
 const s=session();
 projectV11(s,ev('item_completed',{item:{type:'SubAgentActivity',kind:'interacted',agent_thread_id:child}},at+1));assert.equal(s.children.get(child).assignedAt,0);
 projectV11(s,ev('item_completed',{item:{type:'SubAgentActivity',kind:'started',agent_thread_id:child}},at+2));assert.equal(s.children.get(child).assignedAt,at+2);
 projectV11(s,ev('item_completed',{item:{type:'SubAgentActivity',kind:'interacted',agent_thread_id:child}},at+3));assert.equal(s.children.get(child).assignedAt,at+2);
 projectV11(s,ev('item_completed',{item:{type:'SubAgentActivity',kind:'completed',agent_thread_id:child}},at+4));assert.equal(s.children.get(child).assignedAt,at+2);assert.equal(s.children.get(child).ended,true);
});
test('forked child identity survives copied parent metadata and old inherited terminal events',()=>{
 const s=createV11(child);projectV11(s,r('session_meta',{id:child,source:{subagent:{thread_spawn:{parent_thread_id:id}}}},at));
 projectV11(s,r('session_meta',{id},at-10000));projectV11(s,ev('task_complete',{},at-5000));
 assert.equal(s.id,child);assert.equal(s.parent,id);assert.equal(s.activity,'unknown');
 projectV11(s,ev('task_started',{turn_id:'childturn'},at+1));assert.equal(s.activity,'working');
});
test('real observer process emits only bound root and explicit children, and exits on parent EOF',async t=>{
 const root=await fixture(t);
 await writeFile(join(root,'rollout-x-'+id+'.jsonl'),line(r('session_meta',{id}))+line(ev('task_started'))+line(ev('item_completed',{item:{type:'SubAgentActivity',kind:'started',agent_thread_id:child}},at+1)));
 await writeFile(join(root,'rollout-x-'+child+'.jsonl'),line(r('session_meta',{id:child,source:{subagent:{thread_spawn:{parent_thread_id:id}}}}))+line(ev('task_started',{},at+2)));
 const other='33333333-3333-3333-3333-333333333333';await writeFile(join(root,'rollout-x-'+other+'.jsonl'),line(r('session_meta',{id:other}))+line(ev('task_started')));
 const p=spawn(process.execPath,['observer/main-v11.mjs'],{env:{...process.env,CX_SESSIONS_DIR:root,CX_OBSERVER_THREAD_ID:id},stdio:['pipe','pipe','pipe']});t.after(()=>{if(p.exitCode===null)p.kill();});
 const state=await new Promise((res,rej)=>{let buf='';const timeout=setTimeout(()=>rej(Error('timeout')),5000);p.stdout.on('data',d=>{buf+=d;const end=buf.indexOf('\n');if(end>=0){clearTimeout(timeout);res(JSON.parse(buf.slice(0,end)));}});p.once('error',rej);});
 assert.equal(state.thread,id);assert.deepEqual(new Set(state.actors.map(a=>a.id)),new Set([id,child]));
 assert.equal(state.actors.find(a=>a.id===child).assignedAt,at+1,'newer child activity retains parent assignment evidence');
 const exited=new Promise(r=>p.once('exit',r));p.stdin.end();assert.equal(await exited,0);
});
