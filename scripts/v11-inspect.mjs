import { readdir,open,stat,mkdir,writeFile } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {join} from 'node:path';
const root=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'sessions'),files=[];
async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){if(e.isSymbolicLink())continue;const f=join(p,e.name);if(e.isDirectory())await walk(f);else if(e.name.endsWith('.jsonl'))files.push({f,...await stat(f)});}}
await walk(root);files.sort((a,b)=>b.mtimeMs-a.mtimeMs);
const types={},schemas={},metadata=[];
for(const {f}of files.slice(0,12)){
 const lines=createInterface({input:createReadStream(f),crlfDelay:Infinity});
 for await(const l of lines){let r;try{r=JSON.parse(l);}catch{continue;}const p=r.payload||{};const k=r.type+':'+(p.type||'');types[k]=(types[k]||0)+1;
 if(r.type==='session_meta')metadata.push({threadMatch:p.id===process.env.CODEX_THREAD_ID,sessionMatch:p.session_id===process.env.CODEX_SESSION_ID,sourceKind:typeof p.source,sourceKeys:p.source&&typeof p.source==='object'?Object.keys(p.source):[],threadSourceKeys:p.thread_source&&typeof p.thread_source==='object'?Object.keys(p.thread_source):[],parentViaSource:!!p.source?.subagent?.thread_spawn?.parent_thread_id});
 if(/agent|approval|collab|communication/.test(k)){schemas[k]=Object.keys(p);if(p.item)schemas[k+':item']=Object.keys(p.item);}
 if(p.type==='item_completed'&&/Collab|Agent/.test(p.item?.type)){schemas['item:'+p.item.type]=Object.keys(p.item);}
 }
}
const result={date:new Date().toISOString(),files:Math.min(12,files.length),environmentThreadPresent:!!process.env.CODEX_THREAD_ID,environmentSessionMatchesThread:process.env.CODEX_SESSION_ID===process.env.CODEX_THREAD_ID,metadata,types,schemas};
await mkdir('artifacts/v11',{recursive:true});await writeFile('artifacts/v11/log-inventory.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
