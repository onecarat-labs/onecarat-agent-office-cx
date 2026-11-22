// No prompt, turn/start, login, or simulated key input is permitted in this probe.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { root, exe, environment } from './inspect.mjs';
const run=join(root,'runs',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(run,{recursive:true});
const serverEnv=environment(join(run,'server-home'));
const tuiEnv=environment(join(run,'tui-home'));
const version=spawnSync(exe,['--version'],{cwd:run,env:serverEnv,windowsHide:true,encoding:'utf8'}).stdout.trim();
if(version!=='codex-cli 0.169.0') throw new Error('VERSION_MISMATCH');
const report={timestamp:new Date().toISOString(),version,node:process.version,platform:process.platform,
  scope:'03-B: inherited PTY; no prompts, model turns, existing login, or user input',connections:[],rpc:[],notifications:[],
  modelTurnRequestsSent:0,rawOutputSaved:false,children:[],parseErrors:0};
const token=randomBytes(32).toString('hex');
const digest=createHash('sha256').update(token).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));
const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const endpoint=`ws://127.0.0.1:${port}`;
const children=[],sockets=[];
// Loopback-only transparent transport observation. No headers, payloads, tokens,
// response values or thread contents are persisted.
report.terminal={stdin:!!process.stdin.isTTY,stdout:!!process.stdout.isTTY,stderr:!!process.stderr.isTTY};
if(!report.terminal.stdin||!report.terminal.stdout)throw new Error('RUN_FROM_INTERACTIVE_POWERSHELL');
report.tuiTransport={connections:0,upgrades:[],clientMethods:[],serverMethods:[],responses:[]};
const proxySockets=[];
function inspectStream(direction){
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
   if(op===1||op===0){parts.push(body);if(fin){try{const m=JSON.parse(Buffer.concat(parts));
    if(m.method)report.tuiTransport[direction==='client'?'clientMethods':'serverMethods'].push(m.method);
    else if(direction==='server'&&m.id!==undefined)report.tuiTransport.responses.push({id:m.id,ok:!m.error,errorCode:m.error?.code,resultKeys:Object.keys(m.result??{})});
   }catch{report.parseErrors++;}parts=[];}}
  }
 };
}
const proxy=net.createServer(front=>{
 report.tuiTransport.connections++;const back=net.connect({host:'127.0.0.1',port});proxySockets.push(front,back);
 front.on('data',inspectStream('client'));back.on('data',inspectStream('server'));
 front.on('error',()=>back.destroy());back.on('error',()=>front.destroy());
 front.on('close',()=>back.destroy());back.on('close',()=>front.destroy());
 front.pipe(back);back.pipe(front);
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const tuiEndpoint=`ws://127.0.0.1:${proxy.address().port}`;
function child(label,args,env){
  const row={label,closed:false,stdoutBytes:0,stderrBytes:0};report.children.push(row);
  const interactive=label==='remote-TUI';
  const p=spawn(exe,args,{cwd:run,env,windowsHide:true,stdio:interactive?'inherit':['pipe','pipe','pipe']});
  let err='';const closed=new Promise(r=>p.on('close',(code,signal)=>{Object.assign(row,{closed:true,code,signal});r();}));
  p.on('error',e=>row.spawnError=e.code);
  p.stdout?.on('data',b=>row.stdoutBytes+=b.length);
  p.stderr?.on('data',b=>{row.stderrBytes+=b.length;err=(err+b.toString()).slice(-32000);});
  const c={p,row,closed,classification(){
    return {stdinNotTerminal:/stdin is not a terminal/i.test(err),stdoutNotTerminal:/stdout is not a terminal/i.test(err),
      terminalUnavailable:/terminal|console|os error 6/i.test(err),unauthorized:/401|unauthorized/i.test(err),
      connectionRefused:/connection refused|10061/i.test(err),requiresLogin:/not logged in|sign in|login required/i.test(err)};
  }};children.push(c);return c;
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
   if(op===1||op===0){fragments.push(b);if(fin){try{const m=JSON.parse(Buffer.concat(fragments));if(m.id!==undefined&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method){report.notifications.push({client:label,method:m.method,hasRequestId:m.id!==undefined});}}catch{report.parseErrors++;}fragments=[];}}
  }}
  socket.on('data',consume);if(head.length)consume(head);
  resolve({socket,async call(method,params){
   if(!['initialize','thread/list','thread/loaded/list'].includes(method))throw new Error('METHOD_NOT_ALLOWED');
   const seq=++id,m=await new Promise((r,j)=>{const t=setTimeout(()=>{pending.delete(seq);j(new Error('RPC_TIMEOUT'));},5000);pending.set(seq,v=>{clearTimeout(t);r(v);});socket.write(frame(1,JSON.stringify({id:seq,method,params})));});
   report.rpc.push({client:label,method,ok:!m.error,errorCode:m.error?.code,resultKeys:Object.keys(m.result??{}),count:m.result?.data?.length});return m;
  },initialized(){socket.write(frame(1,JSON.stringify({method:'initialized',params:{}})));}});
 });req.end();
});}
async function isOpen(){return new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();r(true);});s.once('error',()=>r(false));});}
try{
 const server=child('app-server',['app-server','--listen',endpoint,'--ws-auth','capability-token','--ws-token-sha256',digest],serverEnv);
 for(let i=0;i<50&&!await isOpen();i++){if(server.row.closed)throw new Error('SERVER_EXITED');await pause(100);}
 if(!await isOpen())throw new Error('SERVER_NOT_READY');report.serverReady=true;
 await connect('no-token');await connect('wrong-token','invalid-probe-token');
 const observers=[];
 for(const label of ['Office-equivalent-A','observer-B']){
  const c=await connect(label,token);if(!c)throw new Error('AUTH_FAILED');observers.push(c);
  await c.call('initialize',{clientInfo:{name:'onecarat_cx_probe03',version:'0.0.0'},capabilities:{experimentalApi:false}});c.initialized();
  await c.call('thread/list',{limit:10});
  await c.call('thread/loaded/list',{});
 }
 const tui=child('remote-TUI',['--remote',tuiEndpoint,'--remote-auth-token-env','ONECARAT_PROBE_WS_TOKEN','--no-alt-screen'],{...tuiEnv,ONECARAT_PROBE_WS_TOKEN:token});
 await Promise.race([tui.closed,pause(10000)]);
 for(const c of observers){await c.call('thread/list',{limit:10});await c.call('thread/loaded/list',{});}
 report.remoteTui={stdio:'inherited Windows PTY; no user input',exited:tui.row.closed,outputCaptured:false};
 report.stopReason=tui.row.closed?'REMOTE_TUI_EXITED_WITHOUT_INPUT':'REMOTE_TUI_REQUIRES_INTERACTIVE_OBSERVATION_OR_INPUT';
 // Once the TUI boundary is reached, perform only read-only teardown observations.
 if(!tui.row.closed){tui.p.kill();await Promise.race([tui.closed,pause(3000)]);}
 report.serverAliveAfterTuiExit=!server.row.closed;
 for(const c of observers)await c.call('thread/list',{limit:10});
 for(const c of observers)c.socket.destroy();await pause(300);
 report.serverAliveAfterObserverDisconnect=!server.row.closed;
}catch(e){report.failure=String(e.message).replaceAll(token,'[REDACTED]').replaceAll(digest,'[REDACTED]');}
finally{
 for(const socket of proxySockets)socket.destroy();await new Promise(r=>proxy.close(r));
 for(const socket of sockets)socket.destroy();
 for(const c of [...children].reverse()){if(!c.row.closed){c.row.stopMethod='owned-child.kill';c.p.kill();}await Promise.race([c.closed,pause(3000)]);}
 report.portClosed=!await isOpen();report.finished=new Date().toISOString();
 writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2));
 writeFileSync(join(root,'result-b.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}

