import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { Rpc } from '../src/rpc.mjs';
import { blankState, thread, project, disconnect, durable } from '../src/state.mjs';
import { Runtime } from '../src/runtime.mjs';
import { mockFactory } from '../src/mock.mjs';
import { serve } from '../src/server.mjs';

const home=()=>mkdtempSync(join(tmpdir(),'cx-unit-'));
const make=(options={})=>new Runtime({factory:mockFactory,directory:home(),cwd:resolve('.cx/workspace'),mode:'demo',...options});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('RPC: split frames, reversed responses and method/request distinction',async()=>{
  const input=new PassThrough(),output=new PassThrough(),rpc=new Rpc(input,output);
  const a=rpc.call('a'),b=rpc.call('b');let notified=0,requested=0;
  rpc.on('notification',()=>notified++);rpc.on('request',()=>requested++);
  input.write('{"id":2,"result":');input.write('"B"}\n{"method":"event"}\n{"id":9,"method":"approval"}\n{"id":1,"result":"A"}\n');
  assert.equal(await a,'A');assert.equal(await b,'B');assert.equal(notified,1);assert.equal(requested,1);rpc.close();
});
test('RPC: timeout is unknown, never retries and ignores late result',async()=>{
  const input=new PassThrough(),output=new PassThrough(),rpc=new Rpc(input,output,{timeout:15});let writes=0;output.on('data',()=>writes++);
  await assert.rejects(rpc.call('turn/start'),/RESULT_UNKNOWN/);input.write('{"id":1,"result":{}}\n');assert.equal(writes,1);assert.equal(rpc.pending.size,0);rpc.close();
});
test('RPC disconnect rejects pending and malformed frame closes channel',async()=>{
  const input=new PassThrough(),rpc=new Rpc(input,new PassThrough());const p=rpc.call('a');input.write('invalid\n');await assert.rejects(p,/INVALID_MESSAGE/);assert.equal(rpc.closed,true);
});
test('RPC error message does not leak upstream secret',async()=>{
  const input=new PassThrough(),rpc=new Rpc(input,new PassThrough());const p=rpc.call('a');input.write('{"id":1,"error":{"code":-1,"message":"secret-token"}}\n');await assert.rejects(p,e=>e.message==='RPC_REJECTED'&&e.code===-1);rpc.close();
});
test('Thread/Turn/Item IDs are isolated; unknown sessions are not imported',()=>{
  const s=blankState();thread(s,'a');thread(s,'b');
  project(s,{method:'item/completed',params:{threadId:'a',turnId:'x',item:{id:'i',type:'agentMessage',text:'A'}}});
  project(s,{method:'item/completed',params:{threadId:'b',turnId:'x',item:{id:'i',type:'agentMessage',text:'B'}}});
  project(s,{method:'turn/started',params:{threadId:'foreign',turn:{id:'x'}}});
  assert.equal(s.threads.a.turns.x.items.i.text,'A');assert.equal(s.threads.b.turns.x.items.i.text,'B');assert.equal(s.threads.foreign,undefined);
});
test('completion before start is terminal; late old completion cannot complete a new Turn',()=>{
  const s=blankState();const t=thread(s,'a');const event=(method,id,status)=>project(s,{method,params:{threadId:'a',turn:{id,status}}});
  event('turn/completed','old','completed');event('turn/started','old');assert.equal(t.status,'completed');
  event('turn/started','new');event('turn/completed','old','completed');assert.equal(t.status,'active');assert.equal(t.activeTurn,'new');
});
test('duplicate Item completion, late start and delta do not regress final answer',()=>{
  const s=blankState();thread(s,'a');const p={threadId:'a',turnId:'t',item:{id:'i',type:'agentMessage',text:'final'}};
  project(s,{method:'item/completed',params:p});project(s,{method:'item/completed',params:p});project(s,{method:'item/started',params:p});project(s,{method:'item/agentMessage/delta',params:{threadId:'a',turnId:'t',itemId:'i',delta:'duplicate'}});
  assert.equal(s.threads.a.turns.t.items.i.text,'final');assert.equal(s.threads.a.turns.t.status,'unknown');
});
test('unknown item type remains unknown; only observed child IDs create agents',()=>{
  const s=blankState();thread(s,'a');project(s,{method:'item/completed',params:{threadId:'a',turnId:'t',item:{id:'i',type:'futureType',text:'not an answer'}}});
  assert.equal(s.threads.a.turns.t.items.i.type,'unknown');assert.equal(s.threads.a.turns.t.items.i.text,'');assert.deepEqual(s.threads.a.agents,{});
  project(s,{method:'item/completed',params:{threadId:'a',turnId:'t',item:{id:'child',type:'collabAgentToolCall',receiverThreadIds:['child-1']}}});assert.equal(s.threads.a.agents['child-1'].status,'observed');
});
test('durable state excludes prompt, response, approval commands and auth',()=>{
  const s=blankState();thread(s,'a');s.auth='private';s.approvals.secret={command:'PASSWORD'};project(s,{method:'item/completed',params:{threadId:'a',turnId:'t',item:{id:'i',type:'agentMessage',text:'TOKEN'}}});
  const saved=JSON.stringify(durable(s));assert.ok(!/PASSWORD|TOKEN|private/.test(saved));
});
test('default runtime refuses model, foreign Thread and resume is absent',async()=>{
  const r=make();await r.connect();const id=await r.create();await assert.rejects(r.submit(id,'test'),/NOT_AUTHORIZED/);await assert.rejects(r.read('foreign'),/UNKNOWN_THREAD/);assert.equal(r.resume,undefined);await r.stop();
});
test('mock run, deny approval, prevent duplicate answer and preserve final state',async()=>{
  const r=make({allowModel:true});await r.connect();const id=await r.create();await r.submit(id,'fixture');await wait(180);
  const a=Object.values(r.state.approvals)[0];assert.equal(a.status,'pending');await r.answer(a.id,'decline');await assert.rejects(r.answer(a.id,'accept'),/ALREADY_HANDLED/);await wait(180);
  assert.equal(r.state.threads[id].status,'completed');assert.equal(a.status,'answered');
  assert.ok(!readFileSync(join(r.directory,'state.json'),'utf8').includes('fixture'));await r.stop();
});
test('approval cancellation, duplicate request and disconnect outcome',async()=>{
  const r=make();await r.connect();const id=await r.create();const m={id:22,method:'item/fileChange/requestApproval',params:{threadId:id,turnId:'t'}};
  r.approval(m);r.approval(m);assert.equal(Object.keys(r.state.approvals).length,1);const a=Object.values(r.state.approvals)[0];
  project(r.state,{method:'serverRequest/resolved',params:{threadId:id,requestId:22}});assert.equal(a.status,'cancelled');
  r.approval({...m,id:23});disconnect(r.state);assert.equal(Object.values(r.state.approvals)[1].status,'unknown');await r.stop();
});
test('unsupported approval is visible and cannot be answered accidentally',async()=>{
  const r=make();await r.connect();const id=await r.create();r.approval({id:2,method:'future/request',params:{threadId:id,turnId:'t'}});const a=Object.values(r.state.approvals)[0];assert.equal(a.supported,false);await assert.rejects(r.answer(a.id,'accept'),/UNSUPPORTED/);await r.stop();
});
test('reconnect never resumes or replays input; previous session is read-only',async()=>{
  const methods=[];const r=make({allowModel:true,factory:()=>{const m=mockFactory();const call=m.rpc.call;m.rpc.call=(name,p)=>{methods.push(name);return call(name,p);};return m;}});
  await r.connect();const id=await r.create();await r.stop();await r.connect();assert.equal(r.state.threads[id],undefined);assert.ok(!methods.includes('thread/resume'));assert.ok(!methods.includes('turn/start'));await assert.rejects(r.submit(id,'test'),/UNKNOWN_THREAD/);await r.stop();
});
test('ambiguous delivery locks retransmission even after reconciliation',async()=>{
  const r=make({allowModel:true});await r.connect();const id=await r.create();const call=r.rpc.call;r.rpc.call=(m,p)=>m==='turn/start'?Promise.reject(Error('RPC_TIMEOUT_RESULT_UNKNOWN')):call(m,p);
  await assert.rejects(r.submit(id,'test'),/UNKNOWN/);await r.read(id);await assert.rejects(r.submit(id,'test again'),/LOCKED/);await r.stop();
});
test('HTTP: authentication, Origin/Host validation, CSP and no arbitrary RPC',async()=>{
  const r=make(),app=await serve(r);try{
    const raw=await fetch(app.origin+'/api/state');assert.equal(raw.status,401);
    const headers={'Content-Type':'application/json','X-CX-Request':'1',Origin:app.origin};
    let response=await fetch(app.origin+'/api/session',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify({token:app.token})});assert.equal(response.status,403);
    response=await fetch(app.origin+'/api/session',{method:'POST',headers,body:JSON.stringify({token:app.token})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
    response=await fetch(app.origin+'/api/connect',{method:'POST',headers:{...headers,Cookie:cookie},body:'{}'});assert.equal(response.status,200);
    response=await fetch(app.origin+'/api/thread/resume',{method:'POST',headers:{...headers,Cookie:cookie},body:JSON.stringify({boundary:r.snapshot().boundary})});assert.equal(response.status,404);
    const badHostStatus=await new Promise((ok,no)=>{const req=http.get(app.origin+'/api/state',{headers:{Cookie:cookie,Host:'evil.example'}},res=>{res.resume();ok(res.statusCode);});req.on('error',no);});assert.equal(badHostStatus,403);
    response=await fetch(app.origin+'/');assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  }finally{await app.close();}
});

test('special object keys cannot create or alter sessions',()=>{
  const s=blankState();assert.equal(thread(s,'__proto__'),null);assert.equal(thread(s,'constructor'),null);assert.deepEqual(s.threads,{});assert.equal({}.status,undefined);
});
test('approval accept requires complete context and uses only offered decisions',async()=>{
  const r=make();await r.connect();const id=await r.create();
  r.approval({id:1,method:'item/commandExecution/requestApproval',params:{threadId:id,turnId:'t'}});
  let a=Object.values(r.state.approvals).at(-1);await assert.rejects(r.answer(a.id,'accept'),/CONTEXT_INCOMPLETE/);await r.answer(a.id,'decline');
  r.approval({id:2,method:'item/commandExecution/requestApproval',params:{threadId:id,turnId:'t',command:'echo test',availableDecisions:['decline']}});
  a=Object.values(r.state.approvals).at(-1);await assert.rejects(r.answer(a.id,'accept'),/NOT_OFFERED/);await r.stop();
});
test('file approval shows Item diff in memory but excludes it from persistence',async()=>{
  const r=make();await r.connect();const id=await r.create();
  project(r.state,{method:'item/started',params:{threadId:id,turnId:'t',item:{id:'f',type:'fileChange',changes:[{path:'test.txt',diff:'+private-diff'}]}}});
  r.approval({id:1,method:'item/fileChange/requestApproval',params:{threadId:id,turnId:'t',itemId:'f'}});
  const a=Object.values(r.state.approvals)[0];assert.equal(a.changes[0].diff,'+private-diff');assert.equal(a.completeContext,true);await r.answer(a.id,'accept');
  assert.ok(!readFileSync(join(r.directory,'state.json'),'utf8').includes('private-diff'));await r.stop();
});
test('API authentication never unlocks model execution',async()=>{
  const r=make({allowModel:true});await r.connect();const id=await r.create();r.state.auth='notChatGPT';await assert.rejects(r.submit(id,'test'),/AUTH_BOUNDARY_STOPPED/);await r.stop();
});
test('read mismatching ID is rejected without importing another session',async()=>{
  const r=make();await r.connect();const id=await r.create();const call=r.rpc.call;r.rpc.call=(method,p)=>method==='thread/read'?Promise.resolve({thread:{id:'foreign',turns:[]}}):call(method,p);
  await assert.rejects(r.read(id),/MISMATCH/);assert.equal(r.state.threads.foreign,undefined);await r.stop();
});
test('simultaneous input is serialized and steering binds expected Turn',async()=>{
  const r=make({allowModel:true});await r.connect();const id=await r.create();const call=r.rpc.call;let release;
  r.rpc.call=(method,p)=>method==='turn/start'?new Promise(ok=>release=()=>ok({turn:{id:'active'}})):call(method,p);
  const first=r.submit(id,'test');await assert.rejects(r.submit(id,'duplicate'),/LOCKED/);await wait(0);release();await first;
  await assert.rejects(r.submit(id,'stale','other-turn'),/TURN_CHANGED/);await r.submit(id,'steer','active');await r.stop();
});
test('restart restores IDs but never restores subscribed or pending execution',async()=>{
  const directory=home();const r=make({directory});await r.connect();const id=await r.create();await r.stop();
  const restored=make({directory});assert.equal(restored.state.selected,null);assert.equal(restored.state.threads[id],undefined);assert.ok(restored.quarantined.has(id));assert.equal(restored.state.auth,'unknown');
});
test('late notifications cannot revive a closed RPC connection',()=>{
  const input=new PassThrough(),rpc=new Rpc(input,new PassThrough());let received=0;rpc.on('notification',()=>received++);rpc.close();input.write('{"method":"turn/started","params":{}}\n');assert.equal(received,0);
});
