import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdirSync,mkdtempSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {allowedPrompt,diagnoseTurn} from './one-turn-guard.mjs';
import {createDryRunGate,attachDryRunGate,serverFrame} from './dry-run-gate.mjs';
const root=import.meta.dirname;
mkdirSync(join(root,'guard-checks'),{recursive:true});
const run=mkdtempSync(join(root,'guard-checks','dry-')),marker=join(run,'marker.json');
const base={id:7,method:'turn/start',params:{threadId:'synthetic-thread',input:[{type:'text',text:allowedPrompt}]}};
const state={armed:true,threadId:'synthetic-thread'};
const passed=[],trace=[];
function test(name,fn){fn();passed.push(name);}
const diagnose=(request=base,extra={})=>diagnoseTurn({request,...state,marker,...extra});
for(const [name,request,extra] of [
 ['NOT_ARMED',base,{armed:false}],['TARGET_THREAD_MISSING',base,{threadId:undefined}],
 ['REQUEST_THREAD_MISSING',{...base,params:{input:base.params.input}},{}],
 ['THREAD_ID_MISMATCH',base,{threadId:'other'}],
 ['INPUT_NOT_ARRAY',{...base,params:{...base.params,input:{}}},{}],
 ['INPUT_COUNT_MISMATCH',{...base,params:{...base.params,input:[]}},{}],
 ['INPUT_TYPE_MISMATCH',{...base,params:{...base.params,input:[{type:'image',text:allowedPrompt}]}},{}],
 ['TEXT_NOT_STRING',{...base,params:{...base.params,input:[{type:'text',text:1}]}},{}],
 ['TEXT_MISMATCH',{...base,params:{...base.params,input:[{type:'text',text:allowedPrompt+'\n'}]}},{}],
 ['SESSION_LOCKED',base,{blocked:true}],
])test(name,()=>assert(diagnose(request,extra).reasons.includes(name)));
class Socket extends EventEmitter{writes=[];destroyed=false;write(b){this.writes.push(Buffer.from(b));return true;}destroy(){this.destroyed=true;}}
function clientFrame(obj,{fin=true,opcode=1}={}){
 const body=Buffer.isBuffer(obj)?obj:Buffer.from(JSON.stringify(obj));
 const frame=serverFrame(body,opcode);frame[0]=(fin?128:0)|opcode;
 const n=frame.length-body.length,mask=Buffer.from([1,2,3,4]);frame[1]|=128;
 const masked=Buffer.from(body);for(let i=0;i<masked.length;i++)masked[i]^=mask[i%4];
 return Buffer.concat([frame.subarray(0,n),mask,masked]);
}
function response(frame){const n=(frame[1]&127)<126?2:(frame[1]&127)===126?4:10;return JSON.parse(frame.subarray(n));}
const controller=createDryRunGate({getState:()=>state,marker,trace:e=>trace.push(e)});
const front=new Socket(),back=new Socket();
attachDryRunGate({front,back,controller,connection:1,withHandshake:false});
test('exact request allowed but never forwarded',()=>{
 const frame=clientFrame(base);front.emit('data',frame.subarray(0,5));front.emit('data',frame.subarray(5));
 assert.equal(back.writes.length,0);assert.equal(response(front.writes[0]).id,7);
 assert.deepEqual(response(front.writes[0]).error.data.reasons,['DRY_RUN_FORWARDING_DISABLED']);
 assert.equal(front.destroyed,false);assert.equal(existsSync(marker),false);
});
test('second request blocked across connection numbers',()=>{
 const second=controller.receive({...base,id:8},2);
 assert.equal(second.forward,false);assert(second.response.error.data.reasons.includes('SESSION_LOCKED'));
 assert.equal(trace.filter(e=>e.stage==='gate_allowed').length,1);
});
test('read still passes on same socket after refusal',()=>{
 front.emit('data',clientFrame({id:9,method:'thread/read',params:{threadId:state.threadId}}));
 assert.equal(back.writes.length,1);assert.equal(front.destroyed,false);
 controller.server({id:9,result:{}},1);
 assert(trace.some(e=>e.stage==='server_response'&&e.requestId===9&&e.method==='thread/read'));
});
test('mismatch locks subsequent exact input and fragmented messages',()=>{
 const f=new Socket(),b=new Socket(),g=createDryRunGate({getState:()=>state,marker,trace:e=>trace.push(e)});
 attachDryRunGate({front:f,back:b,controller:g,connection:3,withHandshake:false});
 const wrong={...base,id:10,params:{...base.params,input:[{type:'text',text:'PRIVATE_SENTINEL'}]}};
 const bytes=Buffer.from(JSON.stringify(wrong));
 f.emit('data',clientFrame(bytes.subarray(0,20),{fin:false}));
 f.emit('data',clientFrame(bytes.subarray(20),{opcode:0}));
 assert(response(f.writes[0]).error.data.reasons.includes('TEXT_MISMATCH'));
 f.emit('data',clientFrame({...base,id:11}));
 assert(response(f.writes[1]).error.data.reasons.includes('SESSION_LOCKED'));
 assert.equal(b.writes.length,0);assert.equal(f.destroyed,false);
});
test('consumed marker diagnosed without changing contents',()=>{
 writeFileSync(marker,'synthetic consumed');assert(diagnose().reasons.includes('ALREADY_CONSUMED'));
 assert.equal(readFileSync(marker,'utf8'),'synthetic consumed');
});
test('server lifecycle events are separate from request receipt',()=>{
 assert(!trace.some(e=>e.stage==='turn_started'||e.stage==='turn_completed'));
 controller.server({method:'turn/started',params:{}},1);
 controller.server({method:'turn/completed',params:{}},1);
 assert(trace.some(e=>e.stage==='turn_started'));assert(trace.some(e=>e.stage==='turn_completed'));
});
test('diagnostic log excludes input text',()=>{
 const json=JSON.stringify(trace);assert(!json.includes(allowedPrompt));assert(!json.includes('PRIVATE_SENTINEL'));
 assert(trace.every(e=>typeof e.time==='string'&&Number.isInteger(e.connection)));
 assert(!trace.some(e=>e.stage==='forwarding_attempt'&&e.method==='turn/start'));
});
test('missing request id rejected',()=>{
 const g=createDryRunGate({getState:()=>state,marker:join(run,'unused'),trace:()=>{}});
 const action=g.receive({...base,id:undefined},4);
 assert(action.response.error.data.reasons.includes('REQUEST_ID_INVALID'));
 assert.equal(action.response.id,null);assert.equal(action.forward,false);
});
test('upgrade and ping preserved without turn forwarding',()=>{
 const f=new Socket(),b=new Socket(),g=createDryRunGate({getState:()=>state,marker:join(run,'unused'),trace:()=>{}});
 attachDryRunGate({front:f,back:b,controller:g,connection:5});
 const header=Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer MOCK_SECRET\r\n\r\n');
 f.emit('data',header.subarray(0,9));f.emit('data',Buffer.concat([header.subarray(9),clientFrame(base)]));
 assert.equal(b.writes.length,1);assert.deepEqual(b.writes[0],header);
 f.emit('data',clientFrame(Buffer.from('ping'),{opcode:9}));
 assert.equal(f.writes.at(-1)[0]&15,10);assert.equal(f.destroyed,false);
 assert(!JSON.stringify(trace).includes('MOCK_SECRET'));
});
const report={timestamp:new Date().toISOString(),kind:'in-memory mock; no Codex processes or network',passed,
 modelRequestsForwarded:0,networkConnections:0,realTuiObserved:false,trace};
writeFileSync(join(root,'dry-run-check-result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:passed.length,modelRequestsForwarded:0,networkConnections:0,realTuiObserved:false}));
