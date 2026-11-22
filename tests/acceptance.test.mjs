import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Rpc} from '../src/rpc.mjs';
import {Runtime} from '../src/runtime.mjs';
import {mockFactory} from '../src/mock.mjs';
import {blankState,thread,project} from '../src/state.mjs';

test('late duplicate old completion cannot overwrite a newer failed Turn',()=>{
  const s=blankState(),t=thread(s,'fixture');
  const emit=(method,id,status)=>project(s,{method,params:{threadId:t.id,turn:{id,status}}});
  emit('turn/started','old');emit('turn/completed','old','completed');
  emit('turn/started','new');emit('turn/completed','new','failed');
  emit('turn/completed','old','completed');
  assert.equal(t.status,'failed');assert.equal(t.turns.new.status,'failed');
});

test('closed RPC discards incoming bytes and releases buffered partial frame',()=>{
  const input=new PassThrough(),rpc=new Rpc(input,new PassThrough());
  input.write('{"partial":');rpc.close();input.write('x'.repeat(100));
  assert.equal(rpc.buffer,'');
});

test('oversized RPC frame rejects pending request with no retry',async()=>{
  const input=new PassThrough(),output=new PassThrough(),rpc=new Rpc(input,output,{maxBytes:32});
  let writes=0;output.on('data',()=>writes++);
  const rejection=assert.rejects(rpc.call('fixture'),/RPC_FRAME_LIMIT/);
  input.write('x'.repeat(33));await rejection;
  assert.equal(writes,1);assert.equal(rpc.pending.size,0);assert.equal(rpc.closed,true);
});

test('multibyte invalid token is rejected as authentication failure and HTTP server survives',()=>{
  // Separate process makes an uncaught HTTP handler exception a bounded test failure.
  const script=`
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import {serve} from './src/server.mjs';
    const app=await serve({stop:async()=>{},snapshot:()=>({}),safeError:()=> 'OPERATION_FAILED'});
    try {
      const login=await fetch(app.origin+'/api/session',{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json','X-CX-Request':'1'},body:JSON.stringify({token:'\\u00e9'.repeat(64)})});
      assert.equal(login.status,403);
      const status=await new Promise((resolve,reject)=>{
        const req=http.get(app.origin+'/api/state',{headers:{Cookie:'cx='+ '\\u00e9'.repeat(64)}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);
      });
      assert.ok([400,401].includes(status)); // HTTP parser may reject non-ASCII before routing.
      assert.equal((await fetch(app.origin+'/')).status,200);
    }finally{await app.close();}
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
});

test('corrupt saved state is visible and never restores a session',()=>{
  const directory=mkdtempSync(join(tmpdir(),'cx-acceptance-'));
  writeFileSync(join(directory,'state.json'),'{broken');
  const r=new Runtime({directory,cwd:directory,factory:mockFactory});
  assert.equal(r.state.error,'STATE_LOAD_FAILED');assert.deepEqual(r.state.threads,{});
});

test('failed state save is visible without throwing or exposing content',()=>{
  const directory=mkdtempSync(join(tmpdir(),'cx-acceptance-'));
  const r=new Runtime({directory,cwd:directory,factory:mockFactory});
  mkdirSync(join(directory,'state.tmp'));
  assert.doesNotThrow(()=>r.changed());assert.equal(r.state.error,'STATE_SAVE_FAILED');
});

test('approval resolved while checking stays cancelled and sends no reply',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'cx-acceptance-'));
  const r=new Runtime({directory,cwd:directory,factory:mockFactory});
  try {
    await r.connect();const id=await r.create();
    r.approval({id:42,method:'item/commandExecution/requestApproval',params:{threadId:id,turnId:'fixture',command:'fixture only'}});
    const a=Object.values(r.state.approvals)[0];let release,replies=0;
    r.rpc.call=()=>new Promise(resolve=>release=resolve);r.rpc.send=()=>replies++;
    const response=r.answer(a.id,'decline');const rejected=assert.rejects(response,/APPROVAL_ALREADY_HANDLED/);
    r.rpc.emit('notification',{method:'serverRequest/resolved',params:{threadId:id,requestId:42}});
    release({account:{type:'chatgpt'}});await rejected;
    assert.equal(replies,0);assert.equal(a.status,'cancelled');
  } finally {await r.stop();}
});
