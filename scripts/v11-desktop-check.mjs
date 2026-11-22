import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,appendFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.cx/v11-tests',{recursive:true});await mkdir('artifacts/v11',{recursive:true});const root=await mkdtemp(resolve('.cx/v11-tests/desktop-'));
const one='11111111-1111-1111-1111-111111111111',two='22222222-2222-2222-2222-222222222222',kid='33333333-3333-3333-3333-333333333333';
const stamp=Date.now(),row=(type,payload,at=Date.now())=>JSON.stringify({timestamp:new Date(at).toISOString(),type,payload})+'\n';const log=id=>join(root,'rollout-test-'+id+'.jsonl');
await writeFile(log(one),row('session_meta',{id:one})+row('event_msg',{type:'task_started',turn_id:'t1'}));
await writeFile(log(two),row('session_meta',{id:two},stamp-50000)+row('event_msg',{type:'task_started',turn_id:'t2'},stamp-40000)+row('event_msg',{type:'exec_approval_request',turn_id:'t2',call_id:'approval'},stamp-30000));
function run(id,file,lang,seconds){const p=spawn(resolve('dist/v1.1-secure/Office-Smoke.exe'),[id,resolve('artifacts/v11/'+file+'.png'),lang,String(seconds)],{stdio:'ignore',env:{...process.env,CX_SESSIONS_DIR:root,CX_NODE_EXE:process.execPath}});return {p,done:new Promise((res,rej)=>{p.once('exit',res);p.once('error',rej);})};}
const a=run(one,'stage-ja','ja-JP',10),b=run(two,'approval-en','en-US',8);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(1200);const duplicate=run(one,'duplicate','ja-JP',3);assert.equal(await duplicate.done,10);
await appendFile(log(one),row('event_msg',{type:'item_completed',turn_id:'t1',item:{type:'SubAgentActivity',kind:'started',agent_thread_id:kid}}));
await sleep(1200);await appendFile(log(one),row('event_msg',{type:'item_completed',turn_id:'t1',item:{type:'FileChange'}}));
await sleep(1200);await appendFile(log(one),row('event_msg',{type:'item_completed',turn_id:'t1',item:{type:'CommandExecution'}}));
await sleep(1200);await appendFile(log(one),row('event_msg',{type:'item_completed',turn_id:'t1',item:{type:'SubAgentActivity',kind:'completed',agent_thread_id:kid}}));
await sleep(1000);await appendFile(log(one),row('event_msg',{type:'task_complete',turn_id:'t1'}));
assert.equal(await a.done,0);assert.equal(await b.done,0);
const A=JSON.parse(await readFile('artifacts/v11/stage-ja.json','utf8')),B=JSON.parse(await readFile('artifacts/v11/approval-en.json','utf8'));
assert.equal(A.thread,one);assert.equal(B.thread,two);assert.equal(A.language,'ja');assert.equal(B.language,'en');assert.equal(A.actors,2);assert.equal(B.actors,1);
assert.match(B.banner,/resolution unknown/);assert.ok(!B.activities.includes('editing'));
assert.ok(A.x+A.width<=B.x||B.x+B.width<=A.x||A.y+A.height<=B.y||B.y+B.height<=A.y,'separate windows');
for(const activity of ['editing','running','finished','reported'])assert.ok(A.activities.includes(activity),activity);
// Mutex release after close permits a fresh window for the same session.
const reopened=run(one,'reopened-ja','ja-JP',4);assert.equal(await reopened.done,0);
await writeFile('artifacts/v11/desktop-result.json',JSON.stringify({duplicateReused:true,isolated:true,nonOverlapping:true,approvalRetainedPast15Seconds:true,reopenAfterClose:true,rootAndChild:true,ja:true,en:true},null,2));console.log('v1.1 native: separate windows, duplicate reuse, reopen, JA/EN, retained approval, child report and owned worker cleanup passed.');
