// Deliberately has no live-turn forwarding callback or live-mode switch.
import {diagnoseTurn} from './one-turn-guard.mjs';
import {shape,threadIdForLog} from './request-shape.mjs';
import {randomBytes} from 'node:crypto';
export function createDryRunGate({getState,marker,trace}){
 let locked=false,attempts=0;const pending=new Map();
 const safeId=id=>typeof id==='number'?id:typeof id==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(id)?id:null;
 function record(stage,connection,requestId,details={}){trace({time:new Date().toISOString(),stage,connection,requestId:safeId(requestId),...details});}
 function reject(request,connection,reasons,checks){
  locked=true;record('gate_rejected',connection,request.id,{reasons,checks});
  record('forwarding_blocked',connection,request.id,{reason:reasons[0]});
  record('local_error_response',connection,request.id,{code:-32005});
  return {forward:false,response:{id:request.id??null,error:{code:-32005,message:'Probe gate rejected request; no model request forwarded',data:{reasons}}}};
 }
 return {
  receive(request,connection){
   record('request_received',connection,request.id,{method:typeof request.method==='string'&&/^[A-Za-z/]+$/.test(request.method)?request.method:'other'});
   if(request.method==='turn/start'){
    const state=getState();
    record('request_shape',connection,request.id,{structure:shape(request),targetThreadId:threadIdForLog(state.threadId),requestThreadId:threadIdForLog(request.params?.threadId)});
    attempts++;const diagnosis=diagnoseTurn({request,...state,marker,blocked:locked});
    if(!(typeof request.id==='string'||Number.isSafeInteger(request.id)))diagnosis.reasons.push('REQUEST_ID_INVALID');
    if(diagnosis.reasons.length)return reject(request,connection,diagnosis.reasons,diagnosis.checks);
    locked=true;record('gate_allowed',connection,request.id,{checks:diagnosis.checks});
    // Passing validation is not permission to execute in this revision.
    record('forwarding_blocked',connection,request.id,{reason:'DRY_RUN_FORWARDING_DISABLED'});
    record('local_error_response',connection,request.id,{code:-32005});
    return {forward:false,response:{id:request.id??null,error:{code:-32005,message:'Probe dry run: validated but not forwarded',data:{reasons:['DRY_RUN_FORWARDING_DISABLED']}}}};
   }
   const allowed=new Set(['initialize','initialized','account/read','model/list','hooks/list','account/bedrock/checkGovCloudRequirements','config/read','configRequirements/read','collaborationMode/list','thread/start','thread/list','thread/loaded/list','thread/read','thread/resume','thread/turns/list','thread/items/list','skills/list','plugin/installed','app/installed','account/rateLimits/read','thread/backgroundTerminals/list']);
   if(!allowed.has(request.method))return reject(request,connection,['METHOD_NOT_ALLOWED']);
   if(request.id!==undefined)pending.set(`${connection}:${request.id}`,request.method);
   record('forwarding_attempt',connection,request.id,{method:request.method});return {forward:true};
  },
  server(message,connection){
   if(message.id!==undefined&&!message.method){const key=`${connection}:${message.id}`;record('server_response',connection,message.id,{method:pending.get(key)??'unmatched',ok:!message.error,errorCode:message.error?.code});pending.delete(key);}
   if(['turn/started','turn/completed'].includes(message.method))record(message.method==='turn/started'?'turn_started':'turn_completed',connection,null);
  },
  get attempts(){return attempts;},get locked(){return locked;}
 };
}

export function serverFrame(payload,opcode=1){
 const body=Buffer.isBuffer(payload)?payload:Buffer.from(JSON.stringify(payload));
 const head=Buffer.alloc(body.length<126?2:body.length<65536?4:10);head[0]=0x80|opcode;
 if(body.length<126)head[1]=body.length;else if(body.length<65536){head[1]=126;head.writeUInt16BE(body.length,2);}else{head[1]=127;head.writeBigUInt64BE(BigInt(body.length),2);}
 return Buffer.concat([head,body]);
}

// Shared by the real loopback proxy and mock tests. No TUI/stdin writes.
export function attachDryRunGate({front,back,controller,connection,withHandshake=true}){
 let buf=Buffer.alloc(0),handshake=!withHandshake,fragments=[];
 const reply=message=>front.write(serverFrame(message));
 front.on('data',data=>{buf=Buffer.concat([buf,data]);
  if(!handshake){const end=buf.indexOf('\r\n\r\n');if(end<0)return;back.write(buf.subarray(0,end+4));buf=buf.subarray(end+4);handshake=true;}
  while(buf.length>=2){let len=buf[1]&127,offset=2;
   if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);offset=4;}else if(len===127){if(buf.length<10)return;len=Number(buf.readBigUInt64BE(2));offset=10;}
   if(len>4e6){front.destroy();return;}const mask=!!(buf[1]&128);if(mask)offset+=4;if(buf.length<offset+len)return;
   const raw=Buffer.from(buf.subarray(0,offset+len)),body=Buffer.from(raw.subarray(offset)),opcode=raw[0]&15,fin=!!(raw[0]&128);buf=buf.subarray(offset+len);
   if(mask)for(let i=0;i<body.length;i++)body[i]^=raw[offset-4+i%4];
   if(opcode===9){front.write(serverFrame(body,10));continue;}
   if(opcode===8||opcode===10){back.write(raw);continue;}
   if(opcode!==1&&opcode!==0){reply({id:null,error:{code:-32600,message:'Unsupported frame type'}});continue;}
   fragments.push({raw,body});if(!fin)continue;
   const complete=fragments;fragments=[];let request;
   try{request=JSON.parse(Buffer.concat(complete.map(f=>f.body)));}catch{reply({id:null,error:{code:-32700,message:'Invalid JSON'}});continue;}
   if(!request||typeof request!=='object'){reply({id:null,error:{code:-32600,message:'Invalid request'}});continue;}
   const action=controller.receive(request,connection);
   if(action.forward){
    // Re-encode validated JSON: never forward unvalidated frame fragments.
    const body=Buffer.from(JSON.stringify(action.request??request)),frame=serverFrame(body),headLength=frame.length-body.length;
    const mask=randomBytes(4);frame[1]|=128;
    for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
    const wire=Buffer.concat([frame.subarray(0,headLength),mask,body]);
    try{action.onAttempt?.();back.write(wire,e=>{if(e)action.onFailure?.();else action.onWritten?.();});}catch{action.onFailure?.();reply({id:request.id??null,error:{code:-32005,message:'Transport failure; delivery unknown; do not retry'}});}
   }
   else reply(action.response);
  }
 });
}
