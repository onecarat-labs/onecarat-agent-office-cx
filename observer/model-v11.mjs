import {createSession,project,publicSession} from './model.mjs';
const clean=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)?v:'';
export function createV11(id){return {...createSession(id),approval:null,requests:new Map(),children:new Map(),sessionEnded:false,identityConfirmed:false,identityAt:0};}
export function projectV11(s,r){
 const p=r?.payload;if(!p||typeof p!=='object')return;
 if(r.type==='session_meta'){
   // Forked logs can include the parent's session_meta and inherited history AFTER
   // the child's own header. Identity belongs to this file, never to copied history.
   if(!clean(p.id)||(s.id&&p.id!==s.id)||s.identityConfirmed)return;
   project(s,r);s.identityConfirmed=true;s.identityAt=Date.parse(r.timestamp)||0;return;
 }
 if(!s.identityConfirmed)return;
 const at=Date.parse(r.timestamp);if(!Number.isFinite(at)||at<s.at||at<s.identityAt||(clean(p.thread_id)&&p.thread_id!==s.id))return;
 if(s.turn&&p.turn_id&&p.turn_id!==s.turn&&p.type!=='task_started')return;
 const before=s.turn;
 // Identity-matched approval evidence persists independently of activity freshness.
 if(r.type==='event_msg'&&['exec_approval_request','apply_patch_approval_request'].includes(p.type)){
   if(s.terminal)return;
   const call=clean(p.call_id),key=call||p.type+':'+at;
   if(s.requests.size<64||s.requests.has(key))s.requests.set(key,{call,turn:s.turn,at});
   else if(!s.requests.has('overflow'))s.requests.set('overflow',{call:'',turn:s.turn,at});
 }
 if(r.type==='event_msg')for(const [key,request]of s.requests){
   const sameCall=!!request.call&&clean(p.call_id)===request.call;
   if((sameCall&&['exec_command_begin','exec_command_end','patch_apply_begin','patch_apply_end'].includes(p.type))||
      (p.type==='item_completed'&&!!request.call&&clean(p.item?.id)===request.call)||
      (['task_complete','turn_aborted'].includes(p.type)&&!!request.turn&&p.turn_id===request.turn))s.requests.delete(key);
 }
 if(r.type==='event_msg'&&p.type==='item_completed'&&p.item?.type==='SubAgentActivity'){
   const i=p.item,cid=clean(i.agent_thread_id);
   if(cid&&cid!==s.id&&['started','interacted','interrupted','completed'].includes(i.kind)){
     const old=s.children.get(cid);if(!old||at>=old.at)s.children.set(cid,{id:cid,parent:s.id,activity:i.kind==='completed'?'reported':i.kind==='interrupted'?'interrupted':i.kind==='started'?'arrived':'working',at,assignedAt:i.kind==='started'?at:(old?.assignedAt||0),ended:i.kind==='completed'});
     if(s.children.size>64)s.children.delete(s.children.keys().next().value);
   }
 }
 // Not emitted by verified 0.169.0 rollout policy; only explicit end evidence is honored.
 if(r.type==='event_msg'&&p.type==='session_end'){s.sessionEnded=true;s.activity='session-ended';s.at=at;s.approval=null;s.requests.clear();return;}
 if(s.sessionEnded)return;
 project(s,r);
 if(p.type==='task_started'&&s.turn!==before)for(const [key,request]of s.requests)if(request.turn&&s.turn!==request.turn)s.requests.delete(key);
 s.approval=[...s.requests.values()].sort((a,b)=>a.at-b.at)[0]||null;
}
export function viewV11(s,now){
 return {...publicSession(s,now),approval:s.approval?(now-s.approval.at<15000?'pending':'uncertain'):'none',approvalAt:s.approval?.at||0,sessionEnded:s.sessionEnded,identityConfirmed:s.identityConfirmed,children:[...s.children.values()]};
}
