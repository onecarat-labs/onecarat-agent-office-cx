import {existsSync,writeFileSync} from 'node:fs';
export const allowedPrompt='これはOnecarat Agent Office CXの接続検証です。日本語で『CX接続テスト成功』とだけ回答してください。ツールの使用、ファイル操作、外部アクセスは行わないでください。';
export function diagnoseTurn({request,armed,threadId,marker,blocked=false}){
 const input=request.params?.input;
 const checks={armed:armed===true,targetThreadPresent:typeof threadId==='string'&&threadId.length>0,
  requestThreadPresent:typeof request.params?.threadId==='string',threadIdMatches:request.params?.threadId===threadId,
  inputIsArray:Array.isArray(input),inputCount:Array.isArray(input)?input.length:null,
  inputTypes:Array.isArray(input)?input.map(i=>['text','image','localImage','audio','localAudio','skill','mention'].includes(i?.type)?i.type:'other'):[],
  textIsString:typeof input?.[0]?.text==='string',textLength:typeof input?.[0]?.text==='string'?input[0].text.length:null,
  textMatches:input?.[0]?.text===allowedPrompt,consumed:existsSync(marker),blocked};
 const reasons=[];
 if(request.method!=='turn/start')reasons.push('METHOD_MISMATCH');
 if(blocked)reasons.push('SESSION_LOCKED');
 if(!checks.armed)reasons.push('NOT_ARMED');
 if(!checks.targetThreadPresent)reasons.push('TARGET_THREAD_MISSING');
 if(!checks.requestThreadPresent)reasons.push('REQUEST_THREAD_MISSING');
 if(!checks.threadIdMatches)reasons.push('THREAD_ID_MISMATCH');
 if(!checks.inputIsArray)reasons.push('INPUT_NOT_ARRAY');
 else if(checks.inputCount!==1)reasons.push('INPUT_COUNT_MISMATCH');
 if(input?.[0]?.type!=='text')reasons.push('INPUT_TYPE_MISMATCH');
 if(!checks.textIsString)reasons.push('TEXT_NOT_STRING');
 else if(!checks.textMatches)reasons.push('TEXT_MISMATCH');
 if(checks.consumed)reasons.push('ALREADY_CONSUMED');
 return {checks,reasons};
}
export function consumeAuthorizedTurn(args){
 const diagnosis=diagnoseTurn(args);
 if(diagnosis.reasons.length)throw Object.assign(new Error('TURN_BLOCKED'),diagnosis);
 const {threadId,marker}=args;
 // Reserve before forwarding, including when forwarding or the Turn later fails.
 try{writeFileSync(marker,JSON.stringify({timestamp:new Date().toISOString(),threadId,limit:1}),{encoding:'utf8',flag:'wx'});}
 catch(e){throw Object.assign(new Error('MARKER_WRITE_FAILED'),{reasons:['MARKER_WRITE_FAILED'],storageErrorCode:e.code});}
}
