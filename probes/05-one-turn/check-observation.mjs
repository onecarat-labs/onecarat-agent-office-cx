import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createTurnObservation,prepareObserverSubscription} from './turn-observation.mjs';
import {createLiveGate} from './live-gate.mjs';
import {allowedPrompt} from './one-turn-guard.mjs';
const root=import.meta.dirname;mkdirSync(join(root,'guard-checks'),{recursive:true});
const dir=mkdtempSync(join(root,'guard-checks','observation-'));
let clock=0,count=0;const passed=[];
const setup=()=>{const o=createTurnObservation({now:()=>clock,inputMs:100,turnMs:200});o.arm('thread-test');return o;};
const forward=o=>o.trace({stage:'forwarding_attempt',method:'turn/start'});
const accept=o=>o.trace({stage:'server_accepted',turnId:'turn-test'});
const event=(method,extra={})=>({method,params:{threadId:'thread-test',turn:{id:'turn-test',status:method==='turn/completed'?'completed':'inProgress'},...extra}});
async function test(name,fn){clock=0;await fn();passed.push(name);}
await test('secondary thread denied, duplicate turn denied, original completes',()=>{
 const o=setup(),trace=[],g=createLiveGate({marker:join(dir,'attempt'),getState:()=>({armed:true,threadId:'thread-test',authorized:true,nonAdmin:true,versionVerified:true,chatgptAuthenticated:true,providerVerified:true,wsAuthenticated:true,observersReady:true,transportConnected:true}),trace:e=>{trace.push(e);o.trace(e);}});
 const request={id:6,method:'turn/start',params:{threadId:'thread-test',input:[{type:'text',text:allowedPrompt}]}};
 const first=g.receive(request,1);assert(first.forward);first.onAttempt();count++;
 g.server({id:6,result:{turn:{id:'turn-test'}}},1);
 o.notification('remote-TUI',event('turn/started'));
 const second=g.receive({id:'startup-thread-2',method:'thread/start',params:{}},1);
 assert.equal(second.forward,false);assert.equal(second.response.id,'startup-thread-2');assert.equal(o.phase,'waiting_turn');
 assert.equal(g.receive({...request,id:7},2).forward,false);assert.equal(o.phase,'waiting_turn');assert.equal(count,1);
 o.notification('observer-B',event('turn/completed'));assert.equal(o.phase,'completed');
 assert(trace.some(e=>e.stage==='server_response'&&e.method==='turn/start'));
 assert(!trace.some(e=>e.stage==='server_response'&&e.method==='unmatched'));
});
await test('items and turn start never imply completion; no content stored',()=>{
 const o=setup();forward(o);accept(o);o.notification('remote-TUI',event('turn/started'));
 for(const method of ['item/started','item/completed'])o.notification('remote-TUI',{method,params:{threadId:'thread-test',turnId:'turn-test',item:{id:'item-test',type:'userMessage',text:'PRIVATE_BODY',content:[{text:allowedPrompt}]}}});
 assert.equal(o.phase,'waiting_turn');assert(o.events.every(e=>e.matched));assert.equal(o.events[2].itemType,'userMessage');assert.equal(o.events[2].itemId,'item-test');
 assert(!JSON.stringify(o.events).includes('PRIVATE_BODY'));assert(!JSON.stringify(o.events).includes(allowedPrompt));
});
await test('wrong thread, wrong turn and unknown client cannot complete',()=>{
 const o=setup();forward(o);accept(o);
 o.notification('remote-TUI',event('turn/completed',{threadId:'foreign'}));
 o.notification('observer-B',event('turn/completed',{turn:{id:'foreign',status:'completed'}}));
 o.notification('foreign',event('turn/completed'));assert.equal(o.phase,'waiting_turn');assert(o.events.every(e=>!e.matched));
});
await test('events before acceptance are matched only after response',()=>{
 const o=setup();forward(o);o.notification('Office-equivalent-A',event('turn/completed'));assert.equal(o.phase,'waiting_turn');accept(o);assert.equal(o.phase,'completed');
});
await test('input wait and turn timeout use separate clocks',()=>{
 const o=setup();clock=99;assert.equal(o.tick(),'waiting_input');forward(o);accept(o);clock=101;assert.equal(o.tick(),'waiting_turn');clock=298;assert.equal(o.tick(),'waiting_turn');clock=299;assert.equal(o.tick(),'turn_timeout');
 const p=setup();clock=399;assert.equal(p.tick(),'input_timeout');
});
await test('all clients compared with thread and turn identities',()=>{
 const o=setup();forward(o);accept(o);
 for(const client of ['remote-TUI','Office-equivalent-A','observer-B']){o.notification(client,event('turn/started'));o.notification(client,event('turn/completed'));}
 for(const events of Object.values(o.comparison())){assert.equal(events.length,2);assert(events.every(e=>e.threadId==='thread-test'&&e.turnId==='turn-test'));}
});
await test('rejection, server error, failed completion and operator stop differ',()=>{
 const a=setup();a.trace({stage:'gate_rejected',reasons:['TEXT_MISMATCH'],observationEffect:'stop'});assert.equal(a.phase,'rejected');
 const b=setup();forward(b);b.trace({stage:'server_rejected'});assert.equal(b.phase,'error');
 const c=setup();forward(c);accept(c);c.notification('observer-B',event('turn/completed',{turn:{id:'turn-test',status:'failed'}}));assert.equal(c.phase,'failed');
 const d=setup();d.stop('operator_stop');assert.equal(d.phase,'operator_stop');
});
await test('read is followed by exact resume only when idle',async()=>{
 const calls=[],client={async call(method,params){calls.push({method,params});return {result:{thread:{id:'thread-test',status:{type:'idle'}}}};}};
 const r=await prepareObserverSubscription(client,'thread-test');assert.equal(r.state,'resume_acknowledged');assert.equal(r.detailEventsObserved,false);
 assert.deepEqual(calls,[{method:'thread/read',params:{threadId:'thread-test',includeTurns:false}},{method:'thread/resume',params:{threadId:'thread-test',excludeTurns:true}}]);
});
await test('active or unknown thread never triggers resume',async()=>{
 for(const type of ['active','notLoaded',undefined]){let calls=0;const result=await prepareObserverSubscription({async call(){calls++;return {result:{thread:{id:'thread-test',status:{type}}}};}},'thread-test');assert.equal(calls,1);assert.equal(result.state,'resume_blocked_not_idle');}
});
await test('resume error retains code not body; wrong thread fails closed',async()=>{
 let n=0;const result=await prepareObserverSubscription({async call(){return ++n===1?{result:{thread:{id:'thread-test',status:{type:'idle'}}}}:{error:{code:-32600,message:'PRIVATE_ERROR'}};}},'thread-test');
 assert.deepEqual(result,{state:'resume_failed',errorCode:-32600});
 const mismatch=await prepareObserverSubscription({async call(){return {result:{thread:{id:'foreign'}}};}},'thread-test');assert.equal(mismatch.state,'thread_mismatch');
});
await test('live entry blocked before processes; actual loop uses observation state',()=>{
 const source=readFileSync(join(root,'live-probe.mjs'),'utf8');
 assert(source.indexOf("throw new Error('OBSERVATION_REPAIR_MOCK_ONLY')")<source.indexOf('const elevationCheck=spawnSync'));
 assert(source.includes('while(!observation.terminal'));assert(!source.includes('!report.gateFailure&&!stopping'));
 assert(source.includes('prepareObserverSubscription(observers[index],targetId)'));
});
console.log(JSON.stringify({passed:passed.length,tests:passed,realModelCalls:0,realTurnForwards:0,codexProcesses:0,networkConnections:0},null,2));
