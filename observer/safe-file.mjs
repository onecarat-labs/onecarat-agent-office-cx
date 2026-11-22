import {open,lstat,realpath} from 'node:fs/promises';
import {relative,isAbsolute} from 'node:path';
export async function openLog(root,path){
 const inside=async()=>{const rel=relative(await realpath(root),await realpath(path));if(rel.startsWith('..')||isAbsolute(rel))throw Error('INVALID_LOG');};
 const before=await lstat(path);if(!before.isFile()||before.isSymbolicLink())throw Error('INVALID_LOG');await inside();
 const handle=await open(path,'r');
 try{const actual=await handle.stat(),after=await lstat(path);await inside();
  if(!actual.isFile()||!after.isFile()||after.isSymbolicLink()||actual.dev!==after.dev||actual.ino!==after.ino||actual.dev!==before.dev||actual.ino!==before.ino)throw Error('LOG_REPLACED');
  return handle;
 }catch(error){await handle.close();throw error;}
}
