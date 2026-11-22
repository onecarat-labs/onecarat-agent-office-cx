// Manual, isolated, no-model observation only. There is deliberately no live mode.
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {exe,environment} from '../03-remote-tui/inspect.mjs';
import {createDryRunGate,attachDryRunGate} from './dry-run-gate.mjs';
import {threadIdForLog} from './request-shape.mjs';
if(process.argv.length!==2)throw Error('NO_OPTIONS_SUPPORTED');
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('INTERACTIVE_POWERSHELL_REQUIRED');
const elevation=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-Command','([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],{windowsHide:true,encoding:'utf8',timeout:5000});
if(elevation.status!==0||elevation.stdout.trim()!=='False')throw Error('ADMINISTRATOR_OR_UNKNOWN_TOKEN_REFUSED');
const root=import.meta.dirname,run=join(root,'runs','observe-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(run,{recursive:true});
const serverEnv=environment(join(run,'server-home')),tuiEnv=environment(join(run,'tui-home'));
const version=spawnSync(exe,['--version'],{cwd:run,env:serverEnv,encoding:'utf8',windowsHide:true,timeout:5000});
if(version.status!==0||version.stdout.trim()!=='codex-cli 0.169.0')throw Error('VERSION_MISMATCH');
const report={started:new Date().toISOString(),version:version.stdout.trim(),mode:'isolated-real-tui-no-forward',trace:[],upgrades:[],threads:[],children:[],rawOutputSaved:false};
const resultPath=join(run,'input-shape-result.json');
const save=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
let targetId,stop=false;const sockets=[],children=[];
const gate=createDryRunGate({getState:()=>({armed:!!targetId,threadId:targetId}),marker:join(root,'turn-consumed.json'),trace:e=>{report.trace.push(e);save();}});
const token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const reserve=net.createServer();await new Promise((r,j)=>{reserve.once('error',j);reserve.listen(0,'127.0.0.1',r);});
const port=reserve.address().port;await new Promise(r=>reserve.close(r));
function observeServer(connection){
 let buf=Buffer.alloc(0),upgraded=false,parts=[];
 return bytes=>{buf=Buffer.concat([buf,bytes]);
  if(!upgraded){const end=buf.indexOf('\r\n\r\n');if(end<0)return;report.upgrades.push({connection,status:Number(/^HTTP\/1\.1 (\d+)/.exec(buf.subarray(0,end).toString())?.[1]??0)});buf=buf.subarray(end+4);upgraded=true;save();}
  while(buf.length>=2){let n=buf[1]&127,o=2;
   if(n===126){if(buf.length<4)return;n=buf.readUInt16BE(2);o=4;}else if(n===127){if(buf.length<10)return;n=Number(buf.readBigUInt64BE(2));o=10;}
   if(n>4e6){stop=true;return;}if(buf.length<o+n)return;
   const op=buf[0]&15,fin=!!(buf[0]&128),body=buf.subarray(o,o+n);buf=buf.subarray(o+n);
   if(op!==1&&op!==0)continue;parts.push(body);if(!fin)continue;
   try{const m=JSON.parse(Buffer.concat(parts));
    const id=m.result?.thread?.id??(m.method==='thread/started'?m.params?.thread?.id:undefined);
    if(id&&!targetId){targetId=id;report.threads.push({connection,id:threadIdForLog(id)});}
    gate.server(m,connection);
   }catch{report.parseErrors=(report.parseErrors??0)+1;}parts=[];save();
  }
 };
}
let connection=0;
const proxy=net.createServer(front=>{
 const seq=++connection,back=net.connect({host:'127.0.0.1',port});sockets.push(front,back);
 for(const [a,b] of [[front,back],[back,front]]){a.on('error',()=>b.destroy());a.on('close',()=>b.destroy());}
 back.on('data',observeServer(seq));
 // The ONLY TUI -> app-server data route; turn/start always gets a local error.
 attachDryRunGate({front,back,controller:gate,connection:seq});back.pipe(front);
});
function child(label,args,env,interactive=false){
 const row={label,closed:false};report.children.push(row);
 const p=spawn(exe,args,{cwd:run,env,windowsHide:true,stdio:interactive?'inherit':['ignore','ignore','ignore']});
 const closed=new Promise(r=>{p.once('error',e=>{row.errorCode=e.code;row.closed=true;r();});p.once('close',code=>{row.closed=true;row.exitCode=code;r();});});
 const c={p,row,closed};children.push(c);return c;
}
async function isOpen(){return new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();r(true);});s.once('error',()=>r(false));});}
process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
try{
 const args=['-c','history.persistence="none"','-c','sandbox_mode="read-only"','-c','web_search="disabled"',
  ...['apps','plugins','remote_plugin','hooks','shell_tool','unified_exec','shell_snapshot','code_mode','code_mode_host','browser_use','browser_use_external','computer_use','in_app_browser','multi_agent','multi_agent_v2','skill_search','skill_mcp_dependency_install'].flatMap(n=>['--disable',n])];
 const server=child('app-server',[...args,'app-server','--listen',`ws://127.0.0.1:${port}`,'--ws-auth','capability-token','--ws-token-sha256',digest],serverEnv);
 for(let i=0;i<50&&!server.row.closed&&!await isOpen();i++)await pause(100);
 if(server.row.closed||!await isOpen())throw Error('ISOLATED_SERVER_NOT_READY');
 await new Promise((r,j)=>{proxy.once('error',j);proxy.listen(0,'127.0.0.1',r);});
 // Printed only BEFORE the TUI starts. No parent output during TUI operation.
 console.log('Isolated observation only. Enter the documented text ONCE in the TUI. Expected: local probe error, no model answer. Exit TUI afterwards. Timeout: 5 minutes.');
 console.log('Result: '+resultPath);
 const tui=child('remote-TUI',[...args,'--remote',`ws://127.0.0.1:${proxy.address().port}`,'--remote-auth-token-env','ONECARAT_PROBE_WS_TOKEN','--no-alt-screen'],{...tuiEnv,ONECARAT_PROBE_WS_TOKEN:token},true);
 for(let i=0;i<3000&&!stop&&!tui.row.closed&&!server.row.closed;i++)await pause(100);
 report.stopReason=tui.row.closed?'TUI_EXITED':stop?'INTERRUPTED':server.row.closed?'SERVER_EXITED':'TIMEOUT';
}catch(e){report.failure=/^[A-Z_]+$/.test(e.message)?e.message:'STARTUP_OR_TRANSPORT_ERROR';}
finally{
 for(const s of sockets)s.destroy();if(proxy.listening)await new Promise(r=>proxy.close(r));
 for(const c of [...children].reverse()){if(!c.row.closed)c.p.kill();await Promise.race([c.closed,pause(3000)]);}
 report.finished=new Date().toISOString();report.portClosed=!await isOpen();report.requestObserved=gate.attempts>0;
 report.turnForwardingAttempts=report.trace.filter(e=>e.stage==='forwarding_attempt'&&e.method==='turn/start').length;
 report.turnStartedObserved=report.trace.some(e=>e.stage==='turn_started');save();
 console.log(JSON.stringify({resultPath,requestObserved:report.requestObserved,turnForwardingAttempts:report.turnForwardingAttempts,portClosed:report.portClosed,allChildrenClosed:children.every(c=>c.row.closed),failure:report.failure},null,2));
}
