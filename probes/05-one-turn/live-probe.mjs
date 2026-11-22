// PREPARED ONLY. Requires renewed user authorization before running this live entry.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { exe, environment } from '../03-remote-tui/inspect.mjs';
import {attachDryRunGate} from './dry-run-gate.mjs';
import {createLiveGate} from './live-gate.mjs';
import {stopOwnedChildren} from './owned-cleanup.mjs';
import {ownedProcessRow} from './owned-process.mjs';
import {createTurnObservation,prepareObserverSubscription} from './turn-observation.mjs';
const root=import.meta.dirname;
// Current scope is mock-only. Do not remove without a separately reviewed live authorization.
throw new Error('OBSERVATION_REPAIR_MOCK_ONLY');
// Current authorization excludes live/model input modes, before any subprocess.
if(process.argv.length!==3||process.argv[2]!=='--authorized-one-turn')throw new Error('FUTURE_EXPLICIT_AUTHORIZATION_REQUIRED');
// The available unsandboxed runner displayed an Administrator title. Fail closed
// before accessing the existing home unless a normal user token is confirmed.
const privilegeStartedAt=new Date().toISOString();
const elevationCheck=spawnSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),
 ['-NoProfile','-Command','([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],
 {windowsHide:true,encoding:'utf8',timeout:5000});
if(elevationCheck.status!==0||elevationCheck.stdout.trim()!=='False')throw new Error('ADMINISTRATOR_OR_UNKNOWN_TOKEN_REFUSED');
if(existsSync(join(root,'live-attempt.json'))||existsSync(join(root,'turn-consumed.json')))throw new Error('ATTEMPT_ALREADY_RESERVED_NO_RETRY');
if(process.argv.includes('--one-turn')&&existsSync(join(root,'turn-consumed.json')))throw new Error('TURN_ALREADY_CONSUMED_DO_NOT_RETRY');
mkdirSync(join(root,'runs'),{recursive:true});
const run=mkdtempSync(join(root,'runs',new Date().toISOString().replace(/[:.]/g,'-')+'-'));
mkdirSync(join(run,'tmp'),{recursive:true});
const serverEnv={};
for(const k of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'])if(process.env[k])serverEnv[k]=process.env[k];
serverEnv.CODEX_HOME=join(process.env.USERPROFILE,'.codex');
serverEnv.RUST_LOG='off';
serverEnv.TEMP=join(run,'tmp');serverEnv.TMP=join(run,'tmp');
const tuiEnv=environment(join(run,'tui-home'));
// The remote TUI delegates model execution to the authenticated server. Do not
// carry the earlier no-model probe's fake provider into the new remote Thread.
writeFileSync(join(run,'tui-home','config.toml'),'check_for_update_on_startup = false\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n');
const versionStartedAt=new Date().toISOString();
const versionProcess=spawnSync(exe,['--version'],{cwd:run,env:serverEnv,windowsHide:true,encoding:'utf8',timeout:5000});
const version=versionProcess.stdout?.trim();
if(version!=='codex-cli 0.169.0') throw new Error('VERSION_MISMATCH');
const report={timestamp:new Date().toISOString(),version,node:process.version,platform:process.platform,
  scope:'05 live preparation; run only after renewed explicit permission',connections:[],rpc:[],notifications:[],
  modelTurnRequestsSent:0,rawOutputSaved:false,children:[],parseErrors:0};
report.owner={pid:process.pid,parentPid:process.ppid,runDirectory:run};
report.preflightProcesses=[{...ownedProcessRow('privilege-check',elevationCheck.pid,process.pid,run),startedAt:privilegeStartedAt,closed:true,status:elevationCheck.status},{...ownedProcessRow('version-check',versionProcess.pid,process.pid,run),startedAt:versionStartedAt,closed:true,status:versionProcess.status}];
const saveReport=()=>writeFileSync(join(run,'live-result.json'),JSON.stringify(report,null,2));
saveReport();
const token=randomBytes(32).toString('hex');
const digest=createHash('sha256').update(token).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));
const port=reserve.address().port;await new Promise(r=>reserve.close(r));
report.serverPort=port;
const endpoint=`ws://127.0.0.1:${port}`;
const children=[],sockets=[];
const allowedPrompt='これはOnecarat Agent Office CXの接続検証です。日本語で『CX接続テスト成功』とだけ回答してください。ツールの使用、ファイル操作、外部アクセスは行わないでください。';
const consumed=join(root,'turn-consumed.json');
let armed=false;const observation=createTurnObservation();report.detailedEvents=observation.events;
const restrictiveArgs=['-c','sandbox_mode="read-only"','-c','approval_policy="never"','-c','web_search="disabled"',
 '-c',`sqlite_home=${JSON.stringify(join(run,'state').replaceAll('\\','/'))}`,
 '-c',`log_dir=${JSON.stringify(join(run,'logs').replaceAll('\\','/'))}`,
 '-c','history.persistence="none"','-c','check_for_update_on_startup=false','-c','analytics.enabled=false',
 ...['apps','plugins','remote_plugin','hooks','shell_tool','unified_exec','shell_snapshot','code_mode','code_mode_host','browser_use','browser_use_external','computer_use','in_app_browser','multi_agent','multi_agent_v2','skill_search','skill_mcp_dependency_install'].flatMap(n=>['--disable',n])];
mkdirSync(join(run,'state'),{recursive:true});mkdirSync(join(run,'logs'),{recursive:true});
let phase='startup', targetId;
report.threadObservations=[];
function threadSummary(thread){if(!thread)return undefined;return {id:thread.id,status:thread.status,turnsArrayLength:thread.turns?.length};}
function recordNotification(client,m){
 const thread=m.params?.thread, id=thread?.id??m.params?.threadId;
 if(m.method==='thread/started'&&client==='Office-equivalent-A'&&!targetId)targetId=id;
 const turn=m.params?.turn;
 report.notifications.push({time:new Date().toISOString(),phase,client,method:m.method,threadId:id,turnId:turn?.id??m.params?.turnId,status:thread?.status??turn?.status??m.params?.status,hasRequestId:m.id!==undefined});
 observation.notification(client,m);report.eventComparison=observation.comparison();report.observationPhase=observation.phase;

}
// Loopback-only transparent transport observation. No headers, payloads, tokens,
// response values or thread contents are persisted.
report.terminal={stdin:!!process.stdin.isTTY,stdout:!!process.stdout.isTTY,stderr:!!process.stderr.isTTY};
if(!report.terminal.stdin||!report.terminal.stdout)throw new Error('RUN_FROM_INTERACTIVE_POWERSHELL');
report.tuiTransport={connections:0,upgrades:[],clientMethods:[],serverMethods:[],responses:[]};
const proxySockets=[];
function inspectStream(direction,connection){
 let buffer=Buffer.alloc(0),upgraded=false,parts=[];
 return data=>{buffer=Buffer.concat([buffer,data]);
  if(!upgraded){const end=buffer.indexOf('\r\n\r\n');if(end<0)return;
   if(direction==='server'){const match=/^HTTP\/1\.1 (\d+)/.exec(buffer.subarray(0,end).toString());report.tuiTransport.upgrades.push(Number(match?.[1]??0));}
   buffer=buffer.subarray(end+4);upgraded=true;
  }
  while(buffer.length>=2){let len=buffer[1]&127,offset=2;
   if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);offset=4;}
   else if(len===127){if(buffer.length<10)return;len=Number(buffer.readBigUInt64BE(2));offset=10;}
   if(len>4000000){buffer=Buffer.alloc(0);return;}
   const masked=!!(buffer[1]&128);if(masked)offset+=4;if(buffer.length<offset+len)return;
   const op=buffer[0]&15,fin=!!(buffer[0]&128),body=Buffer.from(buffer.subarray(offset,offset+len));
   if(masked)for(let i=0;i<len;i++)body[i]^=buffer[offset-4+i%4];buffer=buffer.subarray(offset+len);
   if(op===1||op===0){parts.push(body);if(fin){try{const m=JSON.parse(Buffer.concat(parts));if(direction==='server')controller.server(m,connection);
    if(m.method){report.tuiTransport[direction==='client'?'clientMethods':'serverMethods'].push(m.method);if(direction==='server')recordNotification('remote-TUI',m);}
    else if(direction==='server'&&m.id!==undefined){report.tuiTransport.responses.push({id:m.id,ok:!m.error,errorCode:m.error?.code,resultKeys:Object.keys(m.result??{})});
     if(m.result?.thread&&m.result?.model){report.actualModel=m.result.model;report.actualModelProvider=m.result.modelProvider;report.tuiStartedThreadId=m.result.thread.id;}
    }
   }catch{report.parseErrors++;}parts=[];}}
  }
 };
}
report.gateTrace=[];
const liveMarker=join(root,'live-attempt.json');
const controller=createLiveGate({getState:()=>({armed,threadId:targetId,authorized:true,nonAdmin:true,versionVerified:version==='codex-cli 0.169.0',chatgptAuthenticated:report.auth?.type==='chatgpt',providerVerified:report.actualModelProvider==='openai',wsAuthenticated:report.tuiTransport.upgrades.at(-1)===101,observersReady:report.observersReady===true,transportConnected:report.connected===true}),marker:liveMarker,legacyMarker:consumed,trace:entry=>{report.gateTrace.push(entry);if(entry.stage==='forwarding_attempt'&&entry.method==='turn/start')report.modelTurnRequestsSent=1;observation.trace(entry);report.observationPhase=observation.phase;if(entry.stage==='gate_rejected'){report.rejections??=[];report.rejections.push(entry);}if((entry.stage==='gate_rejected'&&entry.observationEffect!=='continue')||entry.stage==='transport_failure'||entry.stage==='server_rejected')report.gateFailure=entry.stage;writeFileSync(join(run,'live-result.json'),JSON.stringify(report,null,2));}});
let stopping=false,cleaning=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
const proxy=net.createServer(front=>{
 report.tuiTransport.connections++;const back=net.connect({host:'127.0.0.1',port});proxySockets.push(front,back);
 const connection=report.tuiTransport.connections;
 front.on('data',inspectStream('client',connection));back.on('data',inspectStream('server',connection));
 front.on('error',()=>back.destroy());back.on('error',()=>front.destroy());
 back.on('connect',()=>{report.connected=true;});
 front.on('close',()=>back.destroy());back.on('close',()=>{report.connected=false;if(!cleaning)controller.disconnected(connection);front.destroy();});
 attachDryRunGate({front,back,controller,connection});back.pipe(front);
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const tuiEndpoint=`ws://127.0.0.1:${proxy.address().port}`;
report.proxyPort=proxy.address().port;saveReport();
function child(label,args,env){
  const row={label,closed:false,stdoutBytes:0,stderrBytes:0};report.children.push(row);
  const interactive=label==='remote-TUI';
  const p=spawn(exe,args,{cwd:run,env,windowsHide:true,stdio:interactive?'inherit':['pipe','pipe','pipe']});
  Object.assign(row,ownedProcessRow(label,p.pid,process.pid,run));
  let err='';const closed=new Promise(r=>p.on('close',(code,signal)=>{Object.assign(row,{closed:true,closedAt:new Date().toISOString(),code,signal,accessDenied:/access.*denied|permission denied|os error 5/i.test(err)});saveReport();r();}));
  p.on('error',e=>{row.spawnError=e.code;});
  p.stdout?.on('data',b=>row.stdoutBytes+=b.length);
  p.stderr?.on('data',b=>{row.stderrBytes+=b.length;err=(err+b.toString()).slice(-32000);});
  const c={p,row,closed,classification(){
    return {stdinNotTerminal:/stdin is not a terminal/i.test(err),stdoutNotTerminal:/stdout is not a terminal/i.test(err),
      terminalUnavailable:/terminal|console|os error 6/i.test(err),unauthorized:/401|unauthorized/i.test(err),
      connectionRefused:/connection refused|10061/i.test(err),requiresLogin:/not logged in|sign in|login required/i.test(err)};
  }};children.push(c);saveReport();return c;
}
function frame(op,payload){
 const b=Buffer.from(payload);if(b.length>=126) {const mask=randomBytes(4),h=Buffer.alloc(8);h[0]=0x80|op;h[1]=0xfe;h.writeUInt16BE(b.length,2);mask.copy(h,4);for(let i=0;i<b.length;i++)b[i]^=mask[i%4];return Buffer.concat([h,b]);}
 const mask=randomBytes(4),h=Buffer.from([0x80|op,0x80|b.length,...mask]);for(let i=0;i<b.length;i++)b[i]^=mask[i%4];return Buffer.concat([h,b]);
}
async function connect(label,bearer){return new Promise((resolve,reject)=>{
 const key=randomBytes(16).toString('base64'),headers={Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':key};
 if(bearer)headers.Authorization='Bearer '+bearer;
 const req=http.request({hostname:'127.0.0.1',port,path:'/',headers,timeout:3000});
 req.on('error',e=>reject(new Error(e.code)));req.on('timeout',()=>req.destroy(new Error('CONNECT_TIMEOUT')));
 req.on('response',res=>{res.resume();report.connections.push({label,status:res.statusCode});resolve(null);});
 req.on('upgrade',(res,socket,head)=>{
  req.setTimeout(0);sockets.push(socket);socket.on('error',()=>{});
  if(res.headers['sec-websocket-accept']!==createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')){socket.destroy();reject(new Error('BAD_ACCEPT'));return;}
  report.connections.push({label,status:res.statusCode});let buf=Buffer.alloc(0),fragments=[],id=0;const pending=new Map();
  function consume(data){buf=Buffer.concat([buf,data]);while(buf.length>=2){let n=buf[1]&127,o=2;
   if(n===126){if(buf.length<4)return;n=buf.readUInt16BE(2);o=4;}else if(n===127){if(buf.length<10)return;n=Number(buf.readBigUInt64BE(2));o=10;}
   if(n>4000000){socket.destroy();return;}const masked=!!(buf[1]&128);if(masked)o+=4;if(buf.length<o+n)return;
   const op=buf[0]&15,fin=!!(buf[0]&128),b=Buffer.from(buf.subarray(o,o+n));if(masked)for(let i=0;i<n;i++)b[i]^=buf[o-4+i%4];buf=buf.subarray(o+n);
   if(op===8){socket.end(frame(8,b));continue;}if(op===9){socket.write(frame(10,b));continue;}
   if(op===1||op===0){fragments.push(b);if(fin){try{const m=JSON.parse(Buffer.concat(fragments));if(m.id!==undefined&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method){recordNotification(label,m);}}catch{report.parseErrors++;}fragments=[];}}
  }}
  socket.on('data',consume);if(head.length)consume(head);
  resolve({socket,async call(method,params){
   if(!['initialize','thread/list','thread/loaded/list','thread/read','thread/resume','account/read','config/read'].includes(method))throw new Error('METHOD_NOT_ALLOWED');
   if(method.startsWith('thread/')){
    if(!['thread/read','thread/resume'].includes(method)||!targetId||params?.threadId!==targetId)throw new Error('FOREIGN_THREAD_BLOCKED');
    params=method==='thread/read'?{threadId:targetId,includeTurns:false}:{threadId:targetId,excludeTurns:true};
   }
   const seq=++id,m=await new Promise((r,j)=>{const t=setTimeout(()=>{pending.delete(seq);j(new Error('RPC_TIMEOUT'));},5000);pending.set(seq,v=>{clearTimeout(t);r(v);});socket.write(frame(1,JSON.stringify({id:seq,method,params})));});
   report.rpc.push({phase,client:label,method,ok:!m.error,errorCode:m.error?.code,resultKeys:Object.keys(m.result??{}),count:m.result?.data?.length,thread:threadSummary(m.result?.thread),ids:method==='thread/loaded/list'?m.result?.data:undefined});return m;
  },initialized(){socket.write(frame(1,JSON.stringify({method:'initialized',params:{}})));}});
 });req.end();
});}
async function isOpen(){return new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();r(true);});s.once('error',()=>r(false));});}
try{
 const server=child('app-server',[...restrictiveArgs,'app-server','--listen',endpoint,'--ws-auth','capability-token','--ws-token-sha256',digest],serverEnv);
 for(let i=0;i<50&&!await isOpen();i++){if(server.row.closed)throw new Error('SERVER_EXITED');await pause(100);}
 if(!await isOpen())throw new Error('SERVER_NOT_READY');report.serverReady=true;
 await connect('no-token');await connect('wrong-token','invalid-probe-token');
 if(report.connections.some(c=>['no-token','wrong-token'].includes(c.label)&&c.status!==401))throw new Error('WS_AUTH_NOT_ENFORCED');
 const observers=[];
 for(const label of ['Office-equivalent-A','observer-B']){
  const c=await connect(label,token);if(!c)throw new Error('AUTH_FAILED');observers.push(c);
  const init=await c.call('initialize',{clientInfo:{name:'onecarat_cx_probe05',version:'0.0.0'},capabilities:{experimentalApi:false}});if(init.error)throw new Error('INITIALIZE_FAILED');c.initialized();
 }
 const account=await observers[0].call('account/read',{refreshToken:false});
 report.auth={type:account.result?.account?.type,planType:account.result?.account?.planType};
 if(report.auth.type!=='chatgpt')throw new Error('CHATGPT_AUTH_NOT_CONFIRMED');
 const config=await observers[0].call('config/read',{includeLayers:false});
 if(config.error)throw new Error('CONFIG_READ_FAILED');
 const cfg=config.result?.config??{};report.config={model:cfg.model,modelProvider:cfg.model_provider};
 if(cfg.model_provider&&cfg.model_provider!=='openai')throw new Error('NON_OPENAI_PROVIDER_STOP');
 if(Object.values(cfg.mcp_servers??{}).some(v=>v.enabled!==false))throw new Error('MCP_CONFIG_REQUIRES_REVIEW');
 if(process.argv.includes('--connection-only')){report.connectionPreflightComplete=true;throw new Error('CONNECTION_PREFLIGHT_COMPLETE_NO_MODEL');}
 console.log('Future authorized one-turn run. Wait for ready=true before entering the exact prompt once. No retries. Result: '+join(run,'live-result.json'));
 const tui=child('remote-TUI',['--remote',tuiEndpoint,'--remote-auth-token-env','ONECARAT_PROBE_WS_TOKEN','--no-alt-screen'],{...tuiEnv,ONECARAT_PROBE_WS_TOKEN:token});
 for(let i=0;i<200&&!targetId&&!tui.row.closed&&!stopping;i++)await pause(100);
 if(!targetId)throw new Error('NO_THREAD_STARTED_OBSERVED');
 await pause(1000);report.targetThreadId=targetId;
 phase='before-turn';
 for(const c of observers){const read=await c.call('thread/read',{threadId:targetId,includeTurns:false});if(read.error||read.result?.thread?.id!==targetId)throw new Error('OBSERVER_THREAD_NOT_CONFIRMED');}
 if(report.tuiStartedThreadId!==targetId||report.actualModelProvider!=='openai')throw new Error('TUI_THREAD_OR_PROVIDER_NOT_CONFIRMED');
 report.subscriptions=[];
 for(let index=0;index<observers.length;index++){const result=await prepareObserverSubscription(observers[index],targetId);report.subscriptions.push({client:index===0?'Office-equivalent-A':'observer-B',...result});if(result.state!=='resume_acknowledged')throw new Error('OBSERVER_SUBSCRIPTION_NOT_CONFIRMED');}
 report.observersReady=true;observation.arm(targetId);armed=true;report.ready=true;writeFileSync(join(run,'live-result.json'),JSON.stringify(report,null,2));
 phase='one-turn';
 while(!observation.terminal&&!tui.row.closed&&!server.row.closed&&!stopping){observation.tick();if(!observation.terminal)await pause(100);}
 if(stopping)observation.stop('operator_stop');else if(server.row.closed)observation.stop('server_closed');else if(tui.row.closed)observation.stop('tui_closed');
 report.observationPhase=observation.phase;report.eventComparison=observation.comparison();
 armed=false;
 if(observation.phase!=='completed')throw new Error('OBSERVATION_'+observation.phase.toUpperCase());
 // Allow already-delivered peer notifications to drain; do not resume during an active Turn.
 await pause(300);report.eventComparison=observation.comparison();
 phase='after-turn';
 for(const c of observers){await c.call('thread/read',{threadId:targetId,includeTurns:false});await c.call('thread/resume',{threadId:targetId,excludeTurns:true});}
 report.remoteTui={stdio:'inherited Windows terminal; one manually submitted authorized prompt',exited:tui.row.closed,outputCaptured:false};
 report.stopReason='ONE_TURN_SCOPE_COMPLETE';phase='tui-disconnected';
 // Once the TUI boundary is reached, perform only read-only teardown observations.
 if(!tui.row.closed){tui.p.kill();await Promise.race([tui.closed,pause(3000)]);}
 report.serverAliveAfterTuiExit=!server.row.closed;
 for(const c of observers){await c.call('thread/read',{threadId:targetId,includeTurns:false});await c.call('thread/resume',{threadId:targetId,excludeTurns:true});}
 for(const c of observers)c.socket.destroy();await pause(300);
 report.serverAliveAfterObserverDisconnect=!server.row.closed;
}catch(e){report.failure=/^[A-Z_]+$/.test(e.message)?e.message:'PROBE_FAILED_NO_RETRY';}
finally{
 cleaning=true;armed=false;report.ready=false;
 for(const socket of proxySockets)socket.destroy();await new Promise(r=>proxy.close(r));
 report.proxyClosed=!proxy.listening;
 for(const socket of sockets)socket.destroy();
 report.allChildrenClosed=await stopOwnedChildren(children);
 if(!report.allChildrenClosed)process.exitCode=1;
 report.portClosed=!await isOpen();report.finished=new Date().toISOString();
 report.tuiTurnRequestReceived=report.tuiTransport.clientMethods.includes('turn/start');
 report.tuiTurnStartObserved=report.notifications.some(n=>n.method==='turn/started');
 report.approvalRequestObserved=report.notifications.some(n=>n.hasRequestId&&/approval/i.test(n.method));
 report.allChildrenClosed=children.every(c=>c.row.closed);
 writeFileSync(join(run,'live-result.json'),JSON.stringify(report,null,2));
 
 console.log(JSON.stringify({finished:report.finished,authType:report.auth?.type,modelTurnRequestsSent:report.modelTurnRequestsSent,turnStatus:report.turnStatus,failure:report.failure,gateFailure:report.gateFailure,errors:report.rpc.filter(r=>!r.ok),portClosed:report.portClosed,tuiTurnStartObserved:report.tuiTurnStartObserved},null,2));
}



