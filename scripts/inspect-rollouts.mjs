// Read-only schema inventory. Never emit message text, arguments, paths or outputs.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
const root=join(process.env.CODEX_HOME || join(homedir(),'.codex'),'sessions');
async function walk(p){let out=[];for(const e of await readdir(p,{withFileTypes:true})){if(e.isSymbolicLink())continue;const f=join(p,e.name);if(e.isDirectory())out.push(...await walk(f));else if(e.name.endsWith('.jsonl'))out.push({f,...await stat(f)});}return out;}
const files=(await walk(root)).sort((a,b)=>b.mtimeMs-a.mtimeMs).slice(0,5);
const types={}, names={}, schemas={}, meta=[], items={};
for(const f of files){const lines=(await readFile(f.f,'utf8')).split('\n');for(const line of lines){let r;try{r=JSON.parse(line);}catch{continue;}const p=r.payload||{},key=r.type+':'+(p.type||'');types[key]=(types[key]||0)+1;schemas[key]=Object.keys(p);if(r.type==='session_meta')meta.push({keys:Object.keys(p),source:p.source,version:p.cli_version});if(p.name)names[p.name]=(names[p.name]||0)+1;}}
for(const f of files){for(const l of (await readFile(f.f,'utf8')).split('\n')){try{const r=JSON.parse(l);if(r.payload?.type==='item_completed'){const i=r.payload.item;items[i?.type]=Object.keys(i||{});}}catch{}}}
console.log(JSON.stringify({files:files.length,types,names,schemas,meta,items},null,2));
