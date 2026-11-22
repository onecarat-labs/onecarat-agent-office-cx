import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {createLiveGate} from './live-gate.mjs';
import {allowedPrompt} from './one-turn-guard.mjs';
import {attachDryRunGate,serverFrame} from './dry-run-gate.mjs';
import {stopOwnedChildren} from './owned-cleanup.mjs';
import {ownedProcessRow} from './owned-process.mjs';
const root=import.meta.dirname;
const state={armed:true,threadId:'synthetic-thread',authorized:true,nonAdmin:true,versionVerified:true,chatgptAuthenticated:true,providerVerified:true,wsAuthenticated:true,observersReady:true,transportConnected:true};
const request={id:6,method:'turn/start',params:{threadId:state.threadId,input:[{type:'text',text:allowedPrompt,text_elements:[]}],developerInstructions:'PRIVATE_SENTINEL',model:'unwanted'}};
if(process.argv[2]==='--worker'){
 const g=createLiveGate({marker:process.argv[3],getState:()=>state,trace:()=>{}});
 console.log(JSON.stringify({forward:g.receive(request,1).forward}));
}else{
 mkdirSync(join(root,'guard-checks'),{recursive:true});const dir=mkdtempSync(join(root,'guard-checks','live-'));
 const passed=[],trace=[];let counter=0;
 const fresh=(overrides={},marker=join(dir,`marker-${counter++}`))=>({marker,g:createLiveGate({marker,getState:()=>({...state,...overrides}),trace:e=>trace.push(e)})});
 async function test(name,f){await f();passed.push(name);}
 await test('reserve before transfer; strip overrides; exact text only',()=>{
  const {g,marker}=fresh(),a=g.receive(request,1);assert(a.forward);assert(existsSync(marker));
  assert.equal(a.request.params.input[0].text,allowedPrompt);assert.equal(a.request.params.model,undefined);assert.equal(a.request.params.developerInstructions,undefined);
  assert.equal(a.request.params.approvalPolicy,'never');assert.deepEqual(a.request.params.sandboxPolicy,{type:'readOnly'});
  assert.equal(g.receive(request,2).forward,false);
  const child=spawnSync(process.execPath,[join(root,'check-live.mjs'),'--worker',marker],{encoding:'utf8'});
  assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).forward,false);
 });
 await test('mismatch burns attempt across restart',()=>{
  const {g,marker}=fresh();assert.equal(g.receive({...request,params:{...request.params,input:[{type:'text',text:'wrong'}]}},1).forward,false);
  assert.equal(fresh({},marker).g.receive(request,1).forward,false);
 });
 for(const flag of Object.keys(state).filter(k=>typeof state[k]==='boolean'))await test(`preflight ${flag}`,()=>{
  const {g}=fresh({[flag]:false});assert.equal(g.receive(request,1).forward,false);
 });
 await test('reservation I/O failure blocks transfer',()=>{
  const {g}=fresh({},join(dir,'missing','marker'));assert(g.receive(request,1).response.error.data.reasons.includes('RESERVATION_IO_FAILED'));
 });
 class Socket extends EventEmitter{writes=[];destroyed=false;fail=false;write(b,cb){if(this.fail)throw Error('PRIVATE_SOCKET_ERROR');this.writes.push(b);cb?.();}destroy(){this.destroyed=true;}}
 await test('transport failure remains consumed and returns local error',()=>{
  const {g,marker}=fresh(),front=new Socket(),back=new Socket();back.fail=true;
  attachDryRunGate({front,back,controller:g,connection:1,withHandshake:false});front.emit('data',serverFrame(request));
  assert.equal(front.writes.length,1);assert.equal(front.destroyed,false);assert(existsSync(marker));assert.equal(fresh({},marker).g.receive(request,1).forward,false);
 });
 await test('transfer, receipt and lifecycle remain distinct',()=>{
  const {g}=fresh(),front=new Socket(),back=new Socket();
  attachDryRunGate({front,back,controller:g,connection:5,withHandshake:false});front.emit('data',serverFrame(request));assert.equal(back.writes.length,1);
  g.server({id:6,result:{turn:{id:'synthetic-turn'}}},5);
  g.server({method:'turn/started',params:{threadId:state.threadId,turn:{id:'synthetic-turn',status:'inProgress'}}},5);
  g.server({method:'turn/completed',params:{threadId:state.threadId,turn:{id:'synthetic-turn',status:'completed'}}},5);
  for(const stage of ['request_received','gate_allowed','forwarding_attempt','transport_write_completed','server_accepted','model_turn_started','model_turn_completed'])assert(trace.some(e=>e.stage===stage));
 });
 await test('server rejection and disconnect cannot authorize retry',()=>{
  const {g,marker}=fresh();g.receive(request,1);g.server({id:6,error:{code:-32600,message:'PRIVATE_ERROR'}},1);g.disconnected(1);
  assert.equal(fresh({},marker).g.receive(request,1).forward,false);
 });
 await test('read and resume still permitted after duplicate rejection',()=>{
  const {g}=fresh();g.receive(request,1);g.receive(request,1);
  for(const method of ['thread/read','thread/resume'])assert(g.receive({id:8,method,params:{threadId:state.threadId}},1).forward);
 });
 await test('new thread strips client overrides; foreign thread is blocked',()=>{
  const {g}=fresh({threadId:undefined});const start=g.receive({id:1,method:'thread/start',params:{developerInstructions:'PRIVATE_SENTINEL',model:'unwanted'}},1);
  assert(start.forward);assert.deepEqual(start.request.params,{approvalPolicy:'never',sandbox:'read-only'});
  const ready=fresh().g;assert.equal(ready.receive({id:2,method:'thread/resume',params:{threadId:'foreign'}},1).forward,false);
  assert.equal(ready.receive({id:3,method:'thread/start',params:{}},1).forward,false);
 });
 await test('legacy consumed marker also prevents transfer',()=>{
  const legacy=join(dir,'legacy');writeFileSync(legacy,'synthetic');
  const g=createLiveGate({marker:join(dir,'legacy-check'),legacyMarker:legacy,getState:()=>state,trace:()=>{}});
  assert(g.receive(request,1).response.error.data.reasons.includes('LEGACY_CONSUMED'));
 });
 await test('resume and read discard path and other thread overrides',()=>{
  const {g}=fresh();
  for(const method of ['thread/read','thread/resume']){
   const a=g.receive({id:22,method,params:{threadId:state.threadId,path:'foreign-rollout',cwd:'foreign',history:[{text:'PRIVATE_SENTINEL'}]}},1);
   assert(a.forward);assert.equal(a.request.params.threadId,state.threadId);
   assert.deepEqual(Object.keys(a.request.params).sort(),['threadId',method==='thread/read'?'includeTurns':'excludeTurns'].sort());
  }
 });
 await test('thread enumeration never reaches existing history',()=>{
  const {g}=fresh();for(const method of ['thread/list','thread/loaded/list'])assert.equal(g.receive({id:23,method,params:{}},1).forward,false);
  assert.deepEqual(g.receive({id:24,method:'thread/list'},1).response.result.data,[]);
 });
 await test('only one thread creation before start response',()=>{
  const {g}=fresh({threadId:undefined});const start={id:25,method:'thread/start',params:{}};
  assert(g.receive(start,1).forward);assert.equal(g.receive({...start,id:26},2).forward,false);
 });
 await test('ownership metadata binds returned child PID to probe owner',()=>{
  const row=ownedProcessRow('synthetic',123,456,dir);
  assert.equal(row.pid,123);assert.equal(row.ownerPid,456);assert.equal(row.parentPid,456);assert.equal(row.runDirectory,dir);assert.equal(row.ownedByProbe,true);assert.equal(row.closed,false);
  assert.equal(ownedProcessRow('failed-spawn',undefined,456,dir).pid,null);
 });
 await test('owned child cleanup closes only supplied handles',async()=>{
  const order=[],children=['server','tui'].map(label=>{let done;const row={closed:false};return {row,closed:new Promise(r=>done=r),p:{kill(){order.push(label);row.closed=true;done();}}};});
  assert(await stopOwnedChildren(children,async()=>{}));assert.deepEqual(order,['tui','server']);
  assert.equal(await stopOwnedChildren([{row:{closed:false},closed:new Promise(()=>{}),p:{kill(){}}}],async()=>{}),false);
 });
 await test('no secrets in diagnostics or durable record',()=>{
  const text=JSON.stringify(trace);for(const secret of [allowedPrompt,'PRIVATE_SENTINEL','PRIVATE_ERROR','PRIVATE_SOCKET_ERROR'])assert(!text.includes(secret));
  const {g,marker}=fresh();g.receive(request,1);assert(!readFileSync(marker,'utf8').includes(allowedPrompt));
 });
 const result={timestamp:new Date().toISOString(),passed,realModelRequests:0,codexProcessesStarted:0,networkConnections:0,scope:'mock transports; one fresh Node process verifies durable restart block',trace};
 writeFileSync(join(root,'live-check-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:passed.length,realModelRequests:0,codexProcessesStarted:0,networkConnections:0}));
}
