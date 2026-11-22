import {Watcher} from './watcher.mjs';
import {currentThread,sessionsRoot,resolveLog} from './binding.mjs';
import {createV11,projectV11,viewV11} from './model-v11.mjs';
process.stdin.resume();process.stdin.on('end',()=>process.exit(0));process.stdout.on('error',()=>process.exit(0));
let watcher,id,root,lastResolve=0;
try{id=currentThread(process.env,process.env.CX_OBSERVER_THREAD_ID);root=sessionsRoot();}catch{process.stdout.write('{"status":"binding-error","actors":[]}\n');process.exitCode=1;process.stdin.pause();}
export function scoped(state,id){
 const root=state.sessions.find(s=>s.id===id&&s.identityConfirmed);if(!root)return {status:'missing',thread:id,actors:[]};
 const children=new Map(root.children.map(c=>[c.id,{...c,fresh:Date.now()-c.at<15000,approval:'none',sessionEnded:false}]));
 for(const s of state.sessions)if(s.parent===id&&s.identityConfirmed){const explicit=children.get(s.id);if(!explicit||s.at>explicit.at)children.set(s.id,{...s,assignedAt:explicit?.assignedAt||0,ended:explicit?.ended??false});}
 return {status:state.status,thread:id,actors:[root,...children.values()].map(({children,identityConfirmed,...s})=>s)};
}
async function loop(){
 try{
  if(!watcher||Date.now()-lastResolve>5000){const path=await resolveLog(root,id);lastResolve=Date.now();if(!watcher||watcher.pinnedPath!==path)watcher=new Watcher(root,{pinnedPath:path,projector:projectV11,factory:createV11,view:viewV11});}
  const state=await watcher.tick();
  const pinned=watcher.files.get(watcher.pinnedPath);
  state.sessions=state.sessions.filter(s=>s.id!==id);
  if(pinned&&pinned.s.id===id)state.sessions.unshift(viewV11(pinned.s,Date.now()));
  const out=scoped(state,id);
  if(!process.stdout.write(JSON.stringify(out)+'\n'))await new Promise(r=>process.stdout.once('drain',r));
 }catch(e){process.stdout.write(JSON.stringify({status:e.message==='NO_LOG'?'missing':'binding-error',thread:id,actors:[]})+'\n');}
 setTimeout(loop,750);
}
if(id)loop();
