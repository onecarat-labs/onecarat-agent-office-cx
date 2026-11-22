import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createSession,project,publicSession} from '../observer/model.mjs';
import {viewerEnvironment} from '../observer/environment.mjs';
import {openLog} from '../observer/safe-file.mjs';
import {serve} from '../src/server.mjs';
test('CX-004: prototype names and non-string keys never become projected activity values',()=>{
 for(const key of ['constructor','__proto__','toString','hasOwnProperty',null,{},['Reasoning']])for(const kind of ['item','tool']){
  const s=createSession('test');project(s,{timestamp:new Date().toISOString(),type:kind==='item'?'event_msg':'response_item',payload:kind==='item'?{type:'item_completed',item:{type:key}}:{type:'function_call',name:key}});
  const value=JSON.parse(JSON.stringify(publicSession(s,Date.now()))).activity;assert.equal(typeof value,'string');assert.ok(['unknown','tool'].includes(value));
 }
});
test('CX-003: launcher environment excludes keys, tokens and Node preload configuration',()=>{
 const source={Path:'C:\\trusted',SystemRoot:'C:\\Windows',USERPROFILE:'C:\\user',CODEX_HOME:'C:\\codex',CX_SESSIONS_DIR:'C:\\sessions',NODE_OPTIONS:'--require evil',NODE_PATH:'evil',AWS_SECRET_ACCESS_KEY:'secret',OPENAI_API_KEY:'secret',UNRELATED_TOKEN:'secret',CX_NODE_EXE:'evil.exe',CX_OBSERVER_THREAD_ID:'foreign'};
 const clean=viewerEnvironment(source,'C:\\trusted\\node.exe');assert.deepEqual(clean,{PATH:source.Path,SYSTEMROOT:source.SystemRoot,USERPROFILE:source.USERPROFILE,CODEX_HOME:source.CODEX_HOME,CX_SESSIONS_DIR:source.CX_SESSIONS_DIR,CX_NODE_EXE:'C:\\trusted\\node.exe'});
 assert.equal(JSON.stringify(clean).includes('secret'),false);
});
test('CX-007: verified read-only handle rejects directories, out-of-root files and junctions',async()=>{
 await mkdir('.cx/security-tests',{recursive:true});const root=await mkdtemp(resolve('.cx/security-tests/files-')),inside=join(root,'inside'),outside=join(root,'outside');await mkdir(inside);await mkdir(outside);
 const file=join(inside,'log.jsonl');await writeFile(file,'safe\n');await writeFile(join(outside,'log.jsonl'),'outside\n');
 const h=await openLog(inside,file);try{assert.equal(await h.readFile('utf8'),'safe\n');await assert.rejects(h.write('x'));}finally{await h.close();}
 assert.equal(await readFile(file,'utf8'),'safe\n');await assert.rejects(openLog(inside,inside));await assert.rejects(openLog(inside,join(outside,'log.jsonl')));
 await symlink(outside,join(inside,'redirect'),'junction');await assert.rejects(openLog(inside,join(inside,'redirect','log.jsonl')));
});
test('CX-006: legacy local servers use different cookie names for different ports',async()=>{
 const runtime=()=>({stop:async()=>{},snapshot:()=>({boundary:0}),safeError:()=> 'ERROR'});
 const first=await serve(runtime()),second=await serve(runtime());
 try{const login=async app=>{const response=await fetch(app.origin+'/api/session',{method:'POST',headers:{Origin:app.origin,'x-cx-request':'1','Content-Type':'application/json'},body:JSON.stringify({token:app.token})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];};
  const a=await login(first),b=await login(second);assert.notEqual(a.split('=')[0],b.split('=')[0]);assert.match(a,/^cx_\d+=/);
  const rejected=await fetch(second.origin+'/api/state',{headers:{Cookie:a}});assert.equal(rejected.status,401);
 }finally{await first.close();await second.close();}
});
