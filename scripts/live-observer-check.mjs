// Observe existing activity only. Never launch Codex or send a prompt.
import { Watcher } from '../observer/watcher.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const watcher=new Watcher(process.env.CX_SESSIONS_DIR||join(process.env.CODEX_HOME||join(homedir(),'.codex'),'sessions'));
const start=new Date().toISOString(),activities=new Set(),samples=[];
// Drain the bounded initial backlog before measuring live changes.
for(let i=0;i<4;i++)await watcher.tick();
for(let i=0;i<15;i++){
  const state=await watcher.tick();for(const s of state.sessions)activities.add(s.activity);
  samples.push({status:state.status,sessions:state.sessions.length,eventCount:state.sessions.reduce((n,s)=>n+s.events,0),fresh:state.sessions.filter(s=>s.fresh).length});
  await new Promise(r=>setTimeout(r,1000));
}
await mkdir('artifacts/observer',{recursive:true});
const result={kind:'existing-live-rollout-observation',start,end:new Date().toISOString(),platform:process.platform,node:process.version,activities:[...activities],samples,appendedEventsObserved:samples.at(-1).eventCount>samples[0].eventCount,codexProcessesLaunched:0,modelRequestsSent:0};
await writeFile('artifacts/observer/live-observation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
