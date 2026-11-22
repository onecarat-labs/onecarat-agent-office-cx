import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '../src/runtime.mjs';
import { mockFactory } from '../src/mock.mjs';
import { serve } from '../src/server.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function setup(directory=mkdtempSync(join(tmpdir(),'cx-auth-'))) {
  const calls=[],transports=[];let account={type:'chatgpt',email:'a@example.invalid',workspaceName:'A'};
  const r=new Runtime({directory,cwd:directory,allowModel:true,mode:'demo',factory:()=>{
    const t=mockFactory(),call=t.rpc.call;
    t.rpc.call=async(m,p)=>{calls.push({m,p});return m==='account/read'?{account:structuredClone(account)}:call(m,p);};
    transports.push(t);return t;
  }});
  return {r,calls,transports,setAccount:a=>account=a};
}
for(const mode of [null,'chatgpt','apikey'])test(`auth notification ${mode} latches all operations and clears private content`,async()=>{
  const {r,calls}=setup();await r.connect();const id=await r.create();
  await r.submit(id,'fixture');await new Promise(ok=>setTimeout(ok,170));
  const approval=Object.keys(r.state.approvals)[0];
  r.state.threads[id].turns.private={items:{i:{text:'PRIVATE'}}};
  r.rpc.emit('notification',{method:'account/updated',params:{authMode:mode}});
  const count=calls.length;
  await assert.rejects(r.create());await assert.rejects(r.submit(id,'retry'));await assert.rejects(r.submit(id,'steer','x'));
  await assert.rejects(r.answer(approval,'accept'));await assert.rejects(r.answer(approval,'decline'));await assert.rejects(r.read(id));
  assert.equal(calls.length,count);assert.deepEqual(r.snapshot().threads,{});assert.deepEqual(r.snapshot().approvals,{});
  assert.ok(!JSON.stringify(r.snapshot()).includes('PRIVATE'));assert.equal(r.state.safety.activeUnknown,1);
  assert.equal(r.state.authGate,'blocked');await r.stop();
});
test('preflight account switch blocks forwarding without a notification',async()=>{
  const {r,calls,setAccount}=setup();await r.connect();const id=await r.create();setAccount({type:'chatgpt',email:'b@example.invalid'});
  await assert.rejects(r.submit(id,'not sent'));assert.equal(calls.filter(x=>x.m==='turn/start').length,0);assert.equal(r.state.authGate,'blocked');await r.stop();
});
test('failed authentication check blocks create and remains latched',async()=>{
  const {r}=setup();await r.connect();r.rpc.call=async()=>{throw Error('RPC_TIMEOUT_RESULT_UNKNOWN');};await assert.rejects(r.create());assert.equal(r.state.authGate,'blocked');await r.stop();
});
test('unsent request waiting for auth is cancelled, not counted as forwarded',async()=>{
  const {r}=setup();await r.connect();const id=await r.create(),rpc=r.rpc;let release;
  rpc.call=()=>new Promise(ok=>release=ok);
  const request=r.submit(id,'fixture'),rejected=assert.rejects(request);
  rpc.emit('notification',{method:'account/updated',params:{authMode:null}});
  assert.equal(r.state.safety.unsentCancelled,1);assert.equal(r.state.safety.pendingUnknown,0);
  release({account:{type:'chatgpt'}});await rejected;await r.stop();
});
test('late rejected read does not retry against the new connection',async()=>{
  const {r,calls}=setup();await r.connect();const id=await r.create(),rpc=r.rpc,call=rpc.call;let reject;
  rpc.call=(m,p)=>m==='thread/read'?new Promise((ok,no)=>reject=no):call(m,p);
  const request=r.read(id),rejected=assert.rejects(request);await tick();await r.stop();await r.connect();
  const count=calls.length;reject(Error('RPC_REJECTED'));await rejected;assert.equal(calls.length,count);await r.stop();
});
test('unconfirmed owned-process shutdown prevents reconnect',async()=>{
  const {r}=setup();await r.connect();r.transport.stop=async()=>{throw Error('fixture');};await r.stop();
  await assert.rejects(r.connect(),/PROCESS_STOP_UNCONFIRMED/);assert.equal(r.state.authGate,'blocked');
});
test('different account and process restart never read or resume saved IDs',async()=>{
  const {r,calls,setAccount}=setup();await r.connect();const id=await r.create();await r.stop();setAccount({type:'chatgpt',email:'b@example.invalid'});await r.connect();
  await assert.rejects(r.read(id));assert.equal(r.state.selected,null);assert.ok(r.quarantined.has(id));
  const fresh=await r.create();assert.notEqual(fresh,id);await r.stop();
  const other=setup(r.directory);await other.r.connect();assert.deepEqual(other.r.state.threads,{});await assert.rejects(other.r.read(id));
  assert.ok([...calls,...other.calls].every(x=>!['thread/read','thread/resume','turn/start'].includes(x.m)));
  assert.ok(!readFileSync(join(r.directory,'state.json'),'utf8').includes('@'));await other.r.stop();
});
for(const method of ['thread/start','thread/read','turn/start'])test(`late ${method} success cannot repopulate a new auth generation`,async()=>{
  const {r}=setup();await r.connect();const id=await r.create();const rpc=r.rpc,call=rpc.call;let release;
  rpc.call=(m,p)=>m===method?new Promise(ok=>release=ok):call(m,p);
  const operation=method==='thread/start'?r.create():method==='thread/read'?r.read(id):r.submit(id,'fixture');
  const rejected=assert.rejects(operation,/STALE|NOT_CONNECTED/);await tick();
  rpc.emit('notification',{method:'account/updated',params:{authMode:'chatgpt'}});
  if(method==='turn/start')assert.equal(r.state.safety.pendingUnknown,1);
  await r.connect();release(method==='turn/start'?{turn:{id:'late'}}:{thread:{id:method==='thread/start'?'late':id,status:{type:'idle'},turns:[]}});
  await rejected;assert.deepEqual(r.state.threads,{});assert.equal(r.state.authGate,'ready');await r.stop();
});
test('approval authentication race never sends a reply or permits duplicate answers',async()=>{
  const {r}=setup();await r.connect();const id=await r.create();r.approval({id:9,method:'item/commandExecution/requestApproval',params:{threadId:id,turnId:'t',command:'fixture'}});
  const aid=Object.keys(r.state.approvals)[0],rpc=r.rpc;let release,sent=0;
  rpc.call=()=>new Promise(ok=>release=ok);rpc.send=()=>sent++;
  const p=r.answer(aid,'accept'),rejected=assert.rejects(p);await assert.rejects(r.answer(aid,'decline'));
  rpc.emit('notification',{method:'account/updated',params:{authMode:null}});release({account:{type:'chatgpt'}});await rejected;assert.equal(sent,0);await r.stop();
});
test('stale HTTP draft is rejected after reconnect, before any operation',async()=>{
  const {r,calls}=setup();await r.connect();const boundary=r.snapshot().boundary;const app=await serve(r);
  try{
    const headers={'Content-Type':'application/json','X-CX-Request':'1',Origin:app.origin};
    const login=await fetch(app.origin+'/api/session',{method:'POST',headers,body:JSON.stringify({token:app.token})});headers.Cookie=login.headers.get('set-cookie').split(';')[0];
    await r.stop();await r.connect();const count=calls.length;
    const res=await fetch(app.origin+'/api/thread/new',{method:'POST',headers,body:JSON.stringify({boundary})});assert.equal(res.status,409);assert.equal(calls.length,count);
  }finally{await app.close();}
});
test('authentication recovery blocks; late old notifications and requests are ignored',async()=>{
  const {r}=setup();await r.connect();const id=await r.create(),rpc=r.rpc;
  rpc.emit('notification',{method:'modelProvider/authRecoveryStarted',params:{}});await r.connect();
  rpc.emit('notification',{method:'turn/started',params:{threadId:id,turn:{id:'late'}}});rpc.emit('request',{id:1,method:'item/fileChange/requestApproval',params:{threadId:id,turnId:'late'}});
  assert.deepEqual(r.state.threads,{});assert.deepEqual(r.state.approvals,{});await r.stop();
});
