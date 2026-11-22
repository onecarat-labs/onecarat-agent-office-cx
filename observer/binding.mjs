import {readdir,open,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {openLog} from './safe-file.mjs';
export const validThread = s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const sessionsRoot=(env=process.env)=>resolve(env.CX_SESSIONS_DIR||join(env.CODEX_HOME||join(homedir(),'.codex'),'sessions'));
export function currentThread(env=process.env,explicit){
 const value=explicit??env.CODEX_THREAD_ID;
 if(!validThread(value))throw Error('NO_THREAD');
 // CODEX_SESSION_ID is NOT a thread identifier: children can share their parent's session ID.
 return value.toLowerCase();
}
export async function resolveLog(root,id){
 if(!validThread(id))throw Error('NO_THREAD');
 const found=[];let budget=10000;
 async function walk(dir,depth){for(const e of await readdir(dir,{withFileTypes:true})){
   if(--budget<0)throw Error('SCAN_LIMIT');if(e.isSymbolicLink())continue;const path=join(dir,e.name);
   if(e.isDirectory()&&depth<3&&/^\d{2,4}$/.test(e.name))await walk(path,depth+1);
   else if(e.isFile()&&e.name.toLowerCase().endsWith(id.toLowerCase()+'.jsonl')&&e.name.startsWith('rollout-'))found.push(path);
 }}
 await walk(root,0);
 if(found.length!==1)throw Error(found.length?'AMBIGUOUS_LOG':'NO_LOG');
 const path=found[0];if((await lstat(path)).isSymbolicLink())throw Error('INVALID_LOG');
 const rel=relative(await realpath(root),await realpath(path));if(rel.startsWith('..')||isAbsolute(rel))throw Error('INVALID_LOG');
 const h=await openLog(root,path);let meta;
 try{const b=Buffer.alloc(512*1024),r=await h.read(b,0,b.length,0),end=b.subarray(0,r.bytesRead).indexOf(10);if(end<0)throw Error('INVALID_LOG');meta=JSON.parse(b.subarray(0,end).toString('utf8'));}finally{await h.close();}
 if(meta.type!=='session_meta'||meta.payload?.id?.toLowerCase()!==id.toLowerCase())throw Error('IDENTITY_MISMATCH');
 return path;
}
