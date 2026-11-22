// Pure observation state; never sends requests. All stored fields are metadata.
export function createTurnObservation({now=Date.now,inputMs=300000,turnMs=300000}={}){
 const events=[],rejections=[],pending=[];
 let threadId,turnId,phase='unarmed',deadline,forwarded=false;
 const clients=new Set(['remote-TUI','Office-equivalent-A','observer-B']);
 const itemTypes=new Set(['userMessage','agentMessage','reasoning','plan','commandExecution','fileChange','mcpToolCall','dynamicToolCall','webSearch','imageView','imageGeneration','collabAgentToolCall','contextCompaction']);
 function apply(row){
  row.matched=!!turnId&&row.threadId===threadId&&row.turnId===turnId;
  if(row.matched&&row.method==='turn/completed'&&phase==='waiting_turn'){
   phase=row.status==='completed'?'completed':row.status==='failed'?'failed':row.status==='interrupted'?'interrupted':'completion_status_unknown';
  }
 }
 return {
  arm(id){if(phase!=='unarmed')throw Error('ALREADY_ARMED');threadId=id;phase='waiting_input';deadline=now()+inputMs;},
  trace(e){
   if(e.stage==='forwarding_attempt'&&e.method==='turn/start'&&!forwarded){forwarded=true;phase='waiting_turn';deadline=now()+turnMs;}
   if(e.stage==='server_accepted'&&forwarded){
    if(turnId&&turnId!==e.turnId){phase='error';return;}
    turnId=e.turnId;for(const row of pending)apply(row);pending.length=0;
   }
   if(e.stage==='gate_rejected'){
    rejections.push({time:e.time,method:e.method,reasons:e.reasons,requestId:e.requestId});
    if(e.observationEffect==='continue')return;
    if(!forwarded)phase='rejected';else if(e.observationEffect!=='continue')phase='error';
   }
   if(['transport_failure','server_rejected','server_response_unconfirmed'].includes(e.stage))phase='error';
  },
  notification(client,m){
   if(!clients.has(client)||!['turn/started','turn/completed','item/started','item/completed'].includes(m.method))return null;
   const p=m.params??{},item=p.item;
   const row={time:new Date(now()).toISOString(),client,method:m.method,threadId:p.threadId??null,turnId:p.turn?.id??p.turnId??null,matched:false};
   if(m.method.startsWith('item/')){row.itemId=item?.id??null;row.itemType=itemTypes.has(item?.type)?item.type:'unknown';}
   else row.status=['inProgress','completed','failed','interrupted'].includes(p.turn?.status)?p.turn.status:'unknown';
   events.push(row);
   if(!turnId&&forwarded&&row.threadId===threadId)pending.push(row);else apply(row);
   return row;
  },
  tick(){if(['waiting_input','waiting_turn'].includes(phase)&&now()>=deadline)phase=forwarded?'turn_timeout':'input_timeout';return phase;},
  stop(reason){if(['waiting_input','waiting_turn'].includes(phase))phase=reason;},
  get phase(){return phase;},get turnId(){return turnId;},get events(){return events;},get rejections(){return rejections;},
  get terminal(){return !['unarmed','waiting_input','waiting_turn'].includes(phase);},
  comparison(){return Object.fromEntries([...clients].map(client=>[client,events.filter(e=>e.client===client&&e.matched).map(({time,method,threadId,turnId,itemId,itemType,status})=>({time,method,threadId,turnId,itemId,itemType,status}))]));}
 };
}

// v0.169.0: thread/read is a snapshot; thread/resume attaches this connection.
// Conservative policy: never attempt resume on an active/unknown thread.
export async function prepareObserverSubscription(client,threadId){
 const read=await client.call('thread/read',{threadId,includeTurns:false});
 if(read.error)return {state:'read_failed',errorCode:read.error.code};
 if(read.result?.thread?.id!==threadId)return {state:'thread_mismatch'};
 if(read.result.thread.status?.type!=='idle')return {state:'resume_blocked_not_idle'};
 const resume=await client.call('thread/resume',{threadId,excludeTurns:true});
 if(resume.error)return {state:'resume_failed',errorCode:resume.error.code};
 if(resume.result?.thread?.id!==threadId)return {state:'thread_mismatch'};
 return {state:'resume_acknowledged',detailEventsObserved:false};
}
