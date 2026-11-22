import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
// Explicit demo only. These events are fixtures, never presented as actual Codex work.
export function mockFactory() {
  let next=0, stopped=false;const prefix=randomUUID();
  const rpc=new EventEmitter(), sessions=new Map(), pending=new Map(), timers=[];
  const emit=m=>{if(!stopped)rpc.emit('notification',m);};
  const later=(fn,ms)=>timers.push(setTimeout(()=>{if(!stopped)fn();},ms));
  rpc.call=async(method,p={})=>{
    if(stopped)throw Error('RPC_DISCONNECTED');
    if(method==='initialize')return {};
    if(method==='account/read')return {account:{type:'chatgpt'}};
    if(method==='config/read')return {config:{model_provider:'openai'}};
    if(method==='thread/start'){const thread={id:`demo-${prefix}-${++next}`,status:{type:'idle'},turns:[]};sessions.set(thread.id,thread);return {thread};}
    if(method==='thread/list')return {data:[...sessions.values()]};
    if(method==='thread/read'){if(!sessions.has(p.threadId))throw Error('RPC_REJECTED');return {thread:sessions.get(p.threadId)};}
    if(method==='turn/start'){
      const thread=sessions.get(p.threadId);if(!thread)throw Error('RPC_REJECTED');
      const turn={id:`demo-turn-${++next}`,status:'inProgress',items:[]};thread.turns.push(turn);thread.status={type:'active'};
      emit({method:'turn/started',params:{threadId:thread.id,turn}});
      const finish=decision=>{
        const item={id:`demo-item-${next}`,type:'agentMessage',text:decision==='decline'?'［モック］承認を拒否しました。外部操作はありません。':'［モック］依頼を受け取りました。これはUI検証用の応答です。モデルは呼び出していません。'};
        turn.items=[item];turn.status='completed';thread.status={type:'idle'};
        emit({method:'item/completed',params:{threadId:thread.id,turnId:turn.id,item}});
        emit({method:'turn/completed',params:{threadId:thread.id,turn}});
      };
      later(()=>{const id=++next;pending.set(id,{finish,threadId:thread.id});rpc.emit('request',{id,method:'item/commandExecution/requestApproval',params:{threadId:thread.id,turnId:turn.id,itemId:'demo-command',command:'echo demo',reason:'モック承認。コマンドは実行されません。'}});},150);
      return {turn};
    }
    if(method==='turn/steer')return {turnId:p.expectedTurnId};
    throw Error('RPC_REJECTED');
  };
  rpc.send=m=>{if(m.method==='initialized')return;const p=pending.get(m.id);if(p){pending.delete(m.id);emit({method:'serverRequest/resolved',params:{threadId:p.threadId,requestId:m.id}});later(()=>p.finish(m.result.decision),150);}};
  return {rpc,version:'mock',stop:async()=>{stopped=true;timers.forEach(clearTimeout);rpc.emit('disconnect');}};
}
