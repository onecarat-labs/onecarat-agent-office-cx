import { homedir } from 'node:os';
import { join } from 'node:path';
import { Watcher } from './watcher.mjs';
const root=process.env.CX_SESSIONS_DIR||join(process.env.CODEX_HOME||join(homedir(),'.codex'),'sessions');
const watcher=new Watcher(root);
// Only the parent window owns this pipe. EOF ends the observer. No incoming commands.
process.stdin.resume();process.stdin.on('end',()=>process.exit(0));
process.stdout.on('error',()=>process.exit(0));
async function loop(){try{const state=await watcher.tick();if(!process.stdout.write(JSON.stringify(state)+'\n'))await new Promise(r=>process.stdout.once('drain',r));}catch{process.stdout.write('{"status":"unavailable","sessions":[]}\n');}setTimeout(loop,750);}
loop();
