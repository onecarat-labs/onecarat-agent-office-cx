import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
const root=import.meta.dirname, home=join(root,'isolated-home');mkdirSync(home,{recursive:true});
writeFileSync(join(home,'config.toml'),`check_for_update_on_startup = false
model_provider = "probe_local"
chatgpt_base_url = "http://127.0.0.1:9"
[model_providers.probe_local]
name = "Probe disabled endpoint"
base_url = "http://127.0.0.1:9/v1"
wire_api = "responses"
requires_openai_auth = false
[analytics]
enabled = false
[feedback]
enabled = false
[otel]
exporter = "none"
`);
const env={};for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{CODEX_HOME:home,HOME:home,USERPROFILE:home,APPDATA:join(home,'AppData','Roaming'),LOCALAPPDATA:join(home,'AppData','Local'),HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9',NO_PROXY:'localhost,127.0.0.1',RUST_LOG:'off'});
const token=randomBytes(32).toString('hex'), digest=createHash('sha256').update(token).digest('hex');
const report={node:process.version,auth:'capability-token / Bearer',results:[],connections:[],parseErrors:0,stderrBytes:0,stdoutBytes:0};
const clients=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));report.bind='127.0.0.1';report.port=port;
const exe='C:/Users/oneca/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
const p=spawn(exe,['app-server','--listen',`ws://127.0.0.1:${port}`,'--ws-auth','capability-token','--ws-token-sha256',digest],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
let exited=false;const closed=new Promise(r=>p.on('close',(code,signal)=>{exited=true;report.exit={code,signal};r();}));p.on('error',e=>report.spawnError=e.code);p.stdout.on('data',b=>report.stdoutBytes+=b.length);p.stderr.on('data',b=>report.stderrBytes+=b.length);
function frame(op,data=Buffer.alloc(0)){const b=Buffer.isBuffer(data)?data:Buffer.from(data);const mask=randomBytes(4);const h=Buffer.alloc(b.length<126?2:4);h[0]=0x80|op;h[1]=0x80|(b.length<126?b.length:126);if(b.length>=126)h.writeUInt16BE(b.length,2);const c=Buffer.from(b);for(let i=0;i<c.length;i++)c[i]^=mask[i%4];return Buffer.concat([h,mask,c]);}
async function connect(label,bearer){return new Promise(resolve=>{const key=randomBytes(16).toString('base64');const headers={Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':key};if(bearer)headers.Authorization='Bearer '+bearer;
const req=http.request({hostname:'127.0.0.1',port,path:'/',headers,timeout:2500});const done=o=>{report.connections.push({label,...o});resolve(o)};
req.on('response',res=>{res.resume();done({httpStatus:res.statusCode,opened:false});});req.on('error',e=>done({errorCode:e.code,opened:false}));req.on('timeout',()=>req.destroy(Object.assign(new Error('timeout'),{code:'TIMEOUT'})));
req.on('upgrade',(res,socket,head)=>{req.setTimeout(0);const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');if(res.headers['sec-websocket-accept']!==accept){socket.destroy();return done({opened:false,errorCode:'BAD_ACCEPT'});}let buf=Buffer.alloc(0),frag=[],seq=0;const pending=new Map();let ended=false;const end=new Promise(r=>socket.on('close',()=>{ended=true;r();}));
const c={label,socket,end,send:m=>socket.write(frame(1,JSON.stringify(m))),async call(method,params){const id=++seq;const start=Date.now();const m=await new Promise((r,j)=>{const t=setTimeout(()=>{pending.delete(id);j(new Error('RPC_TIMEOUT'))},5000);pending.set(id,v=>{clearTimeout(t);r(v)});c.send({id,method,params});});const row={client:label,method,id,ok:!m.error,elapsedMs:Date.now()-start};if(m.error)row.errorCode=m.error.code;else {row.resultKeys=Object.keys(m.result??{});if(method==='thread/list'){row.count=m.result?.data?.length;row.dataIsArray=Array.isArray(m.result?.data);row.nextCursorIsNull=m.result?.nextCursor===null;}}report.results.push(row);return m;},async close(){socket.write(frame(8,Buffer.from([3,232])));await Promise.race([end,sleep(1500)]);if(!ended)socket.destroy();await end;}};
function consume(data){buf=Buffer.concat([buf,data]);while(buf.length>=2){let len=buf[1]&127,off=2;if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);off=4;}else if(len===127){if(buf.length<10)return;len=Number(buf.readBigUInt64BE(2));off=10;}const masked=!!(buf[1]&128);if(masked)off+=4;if(buf.length<off+len)return;const op=buf[0]&15,fin=!!(buf[0]&128);let body=Buffer.from(buf.subarray(off,off+len));if(masked)for(let i=0;i<body.length;i++)body[i]^=buf[off-4+i%4];buf=buf.subarray(off+len);if(op===8){socket.end(frame(8,body));continue;}if(op===9){socket.write(frame(10,body));continue;}if(op===1||op===0){frag.push(body);if(fin){try{const m=JSON.parse(Buffer.concat(frag));if(m.id!==undefined){pending.get(m.id)?.(m);pending.delete(m.id);}}catch{report.parseErrors++;}frag=[];}}}}
socket.on('data',consume);socket.on('error',()=>{});if(head.length)consume(head);clients.push(c);report.connections.push({label,opened:true,httpStatus:101});resolve({opened:true,client:c});});req.end();});}
async function ready(){for(let i=0;i<50;i++){if(exited)throw new Error('SERVER_EXITED');const ok=await new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false));});if(ok)return;await sleep(100);}throw new Error('START_TIMEOUT');}
async function init(c){await c.call('initialize',{clientInfo:{name:'onecarat_cx_probe02',version:'0.0.0'},capabilities:{experimentalApi:false}});c.send({method:'initialized',params:{}});}
try{
 await ready();report.ready=true;
 await connect('no-token');await connect('wrong-token','invalid-probe-token');
 const a=(await connect('A',token)).client;if(!a)throw new Error('AUTH_CONNECT_FAILED');
 await a.call('thread/list',{limit:1});await init(a);
 const b=(await connect('B',token)).client;if(!b)throw new Error('SECOND_CONNECT_FAILED');
 await b.call('thread/list',{limit:1});await init(b);
 await Promise.all([a.call('thread/list',{limit:1}),b.call('thread/list',{limit:1})]);
 await a.call('probe/nonexistent',{});await a.call('thread/list',{limit:1});
 await a.close();report.aClosed=true;await b.call('thread/list',{limit:1});
 await b.close();report.bClosed=true;await sleep(2000);report.aliveAfterBothClosed=!exited;
 const c=(await connect('C-reconnect',token)).client;if(!c)throw new Error('RECONNECT_FAILED');await init(c);await c.call('thread/list',{limit:1});await c.close();
 p.stdin.end();await sleep(1000);report.aliveAfterStdinEOF=!exited;
}catch(e){report.failure=e.message;}
finally{
 for(const c of clients)c.socket.destroy();
 if(!exited){report.stopMethod='child.kill';p.kill();}
 await Promise.race([closed,sleep(4000)]);report.processClosed=exited;
 report.portClosed=await new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();r(false)});s.once('error',()=>r(true));});
 writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
