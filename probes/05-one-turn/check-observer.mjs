import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDryRunGate,attachDryRunGate,serverFrame} from './dry-run-gate.mjs';
import {allowedPrompt} from './one-turn-guard.mjs';
import {shape} from './request-shape.mjs';
const root=import.meta.dirname;mkdirSync(join(root,'guard-checks'),{recursive:true});
const dir=mkdtempSync(join(root,'guard-checks','observer-'));
const passed=[],trace=[],threadId='00000000-0000-0000-0000-000000000001';
function test(name,f){f();passed.push(name);}
const g=createDryRunGate({marker:join(dir,'absent'),getState:()=>({armed:true,threadId}),trace:e=>trace.push(e)});
const request={id:1,method:'turn/start',params:{threadId,input:[{type:'text',text:allowedPrompt,text_elements:[]}],secret:'PRIVATE_VALUE'}};
test('JSON structure recorded without field values',()=>{
 const result=g.receive(request,1);assert.equal(result.forward,false);
 const s=trace.find(e=>e.stage==='request_shape');assert.equal(s.requestThreadId,threadId);
 assert.equal(s.structure.fields.params.fields.input.items[0].fields.text,'string');
 assert.equal(s.structure.fields.params.unknownKeyCount,1);
 const checks=trace.find(e=>e.stage==='gate_allowed').checks;
 assert(checks.textMatches&&checks.threadIdMatches&&checks.armed);assert.equal(checks.inputCount,1);
 assert(!JSON.stringify(trace).includes(allowedPrompt));assert(!JSON.stringify(trace).includes('PRIVATE_VALUE'));
 assert(!JSON.stringify(shape({PRIVATE_KEY:'PRIVATE_VALUE'})).includes('PRIVATE_KEY'));
});
test('every model or action method rejected',()=>{
 for(const method of ['turn/start','turn/steer','turn/resume','command/exec','process/spawn','account/login/start','config/value/write','review/start']){
  const r=g.receive({...request,method},2);assert.equal(r.forward,false);
 }
 assert(!trace.some(e=>e.stage==='forwarding_attempt'));
});
class Socket extends EventEmitter{writes=[];destroyed=false;write(b){this.writes.push(Buffer.from(b));}destroy(){this.destroyed=true;}}
test('wire-level request id preserved and socket remains usable',()=>{
 const f=new Socket(),b=new Socket(),c=createDryRunGate({marker:join(dir,'absent'),getState:()=>({armed:true,threadId}),trace:()=>{}});
 attachDryRunGate({front:f,back:b,controller:c,connection:3,withHandshake:false});
 f.emit('data',serverFrame(request));assert.equal(b.writes.length,0);
 const reply=f.writes[0],offset=(reply[1]&127)===126?4:2;
 assert.equal(JSON.parse(reply.subarray(offset)).id,1);assert.equal(f.destroyed,false);
 f.emit('data',serverFrame({id:2,method:'thread/read',params:{threadId}}));assert.equal(b.writes.length,1);
});
test('manual entry has no alternative forwarding or live-mode switch',()=>{
 const source=readFileSync(join(root,'observe-tui.mjs'),'utf8');
 assert(source.includes('attachDryRunGate({front,back,controller:gate,connection:seq})'));
 assert(!/front\.pipe|back\.write|turn\/start.*socket\.write/.test(source));
 assert(source.includes("if(process.argv.length!==2)throw Error('NO_OPTIONS_SUPPORTED')"));
 assert(source.indexOf('INTERACTIVE_POWERSHELL_REQUIRED')<source.indexOf('const elevation=spawnSync'));
 assert(source.includes("environment(join(run,'server-home'))")&&source.includes("environment(join(run,'tui-home'))"));
});
const result={timestamp:new Date().toISOString(),passed,modelRequestsForwarded:0,codexProcessesStarted:0,networkConnections:0,realTuiObserved:false,trace};
writeFileSync(join(root,'observer-check-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:passed.length,modelRequestsForwarded:0,realTuiObserved:false}));
