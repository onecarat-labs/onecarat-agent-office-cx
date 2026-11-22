import {openSync,writeFileSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {diagnoseTurn} from './one-turn-guard.mjs';
import {createDryRunGate} from './dry-run-gate.mjs';
import {shape} from './request-shape.mjs';
// Pure controller: no sockets/processes. The caller supplies transport and verified state.
export function createLiveGate({marker,legacyMarker,getState,trace}){
 let locked=false,active,turnId,ended=false,threadStartReserved=false;
 const log=(stage,connection,requestId,details={})=>trace({time:new Date().toISOString(),stage,connection,requestId:Number.isSafeInteger(requestId)||typeof requestId==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(requestId)?requestId:null,...details});
 const readonly=createDryRunGate({marker,getState,trace});
 function reject(request,connection,reasons,checks){
  locked=true;log('gate_rejected',connection,request.id,{method:request.method,reasons,checks,observationEffect:reasons.includes('SECOND_THREAD_BLOCKED')||(active&&request.method==='turn/start')?'continue':'stop'});
  return {forward:false,response:{id:request.id??null,error:{code:-32005,message:'One-turn probe refused; do not retry',data:{reasons}}}};
 }
 return {
  receive(request,connection){
   if(request.method!=='turn/start'){
    if(['thread/list','thread/loaded/list'].includes(request.method))return {forward:false,response:{id:request.id,result:request.method==='thread/list'?{data:[],nextCursor:null}:{data:getState().threadId?[getState().threadId]:[]}}};
    if(['thread/turns/list','thread/items/list','thread/backgroundTerminals/list'].includes(request.method))return reject(request,connection,['METHOD_NOT_REQUIRED']);
    if(['thread/read','thread/resume'].includes(request.method)&&(!getState().threadId||request.params?.threadId!==getState().threadId))return reject(request,connection,['FOREIGN_THREAD_BLOCKED']);
    if(request.method==='thread/start'&&(getState().threadId||threadStartReserved))return reject(request,connection,['SECOND_THREAD_BLOCKED']);
    const action=readonly.receive(request,connection);
    if(action.forward&&request.method==='thread/start'){threadStartReserved=true;action.request={id:request.id,method:'thread/start',params:{approvalPolicy:'never',sandbox:'read-only'}};}
    if(action.forward&&['thread/read','thread/resume'].includes(request.method))action.request={id:request.id,method:request.method,params:request.method==='thread/read'?{threadId:getState().threadId,includeTurns:false}:{threadId:getState().threadId,excludeTurns:true}};
    return action;
   }
   const state=getState();
   log('request_received',connection,request.id,{method:'turn/start',structure:shape(request)});
   const d=diagnoseTurn({request,...state,marker,blocked:locked});
   for(const key of ['authorized','nonAdmin','versionVerified','chatgptAuthenticated','providerVerified','wsAuthenticated','observersReady','transportConnected'])if(state[key]!==true)d.reasons.push('PREFLIGHT_'+key.toUpperCase());
   if(legacyMarker&&existsSync(legacyMarker))d.reasons.push('LEGACY_CONSUMED');
   if(!Number.isSafeInteger(request.id))d.reasons.push('REQUEST_ID_INVALID');
   // Burn the durable attempt on the FIRST request, including mismatches.
   // Never delete it on rejection, disconnect, timeout, server error or success.
   let fd;
   try{fd=openSync(marker,'wx');writeFileSync(fd,JSON.stringify({time:new Date().toISOString(),limit:1,state:'attempt-reserved'}));fsyncSync(fd);}
   catch(e){d.reasons.push(e.code==='EEXIST'?'ATTEMPT_ALREADY_RESERVED':'RESERVATION_IO_FAILED');}
   finally{if(fd!==undefined)closeSync(fd);}
   if(d.reasons.length)return reject(request,connection,d.reasons,d.checks);
   locked=true;active={connection,id:request.id,threadId:state.threadId};
   log('gate_allowed',connection,request.id,{checks:d.checks});
   // Strip TUI overrides (cwd, provider/model, collaboration settings, extra instructions).
   // Only the validated single plain text and thread identifier are forwarded.
   const outgoing={id:request.id,method:'turn/start',params:{threadId:state.threadId,input:[{type:'text',text:request.params.input[0].text}],approvalPolicy:'never',sandboxPolicy:{type:'readOnly'}}};
   return {forward:true,request:outgoing,onAttempt(){log('forwarding_attempt',connection,request.id,{method:'turn/start'});},onWritten(){log('transport_write_completed',connection,request.id);},onFailure(){log('transport_failure',connection,request.id,{reason:'WRITE_FAILED_DELIVERY_UNKNOWN_NO_RETRY'});}};
  },
  server(m,connection){
   const activeResponse=active&&connection===active.connection&&m.id===active.id&&!m.method;
   if(activeResponse)log('server_response',connection,m.id,{method:'turn/start',ok:!m.error,errorCode:typeof m.error?.code==='number'?m.error.code:undefined});
   else readonly.server(m,connection);
   if(active&&connection===active.connection&&m.id===active.id&&!m.method){
    if(m.error)log('server_rejected',connection,m.id,{errorCode:typeof m.error.code==='number'?m.error.code:null});
    else if(m.result?.turn?.id){turnId=m.result.turn.id;log('server_accepted',connection,m.id,{turnId});}
    else log('server_response_unconfirmed',connection,m.id);
   }
   if(active&&m.params?.threadId===active.threadId&&['turn/started','turn/completed'].includes(m.method)){
    const id=m.params.turn?.id??m.params.turnId;
    if(turnId&&id!==turnId)return;
    turnId=id;if(m.method==='turn/completed')ended=true;log(m.method==='turn/started'?'model_turn_started':'model_turn_completed',connection,active.id,{turnId,status:m.params.turn?.status});
   }
  },
  disconnected(connection){if(active?.connection===connection)log(ended?'transport_closed_after_completion':'transport_failure',connection,active.id,{reason:ended?'COMPLETED':'DISCONNECTED_DELIVERY_UNKNOWN_NO_RETRY'});},
 };
}
