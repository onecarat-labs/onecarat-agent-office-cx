import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
const root = import.meta.dirname;
const home = join(root,'isolated-home'); mkdirSync(home,{recursive:true});
writeFileSync(join(home,'config.toml'), `check_for_update_on_startup = false
model_provider = "probe_local"
chatgpt_base_url = "http://127.0.0.1:9"
[model_providers.probe_local]
name = "Probe local disabled endpoint"
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
const env = {};
for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP']) if(process.env[k]) env[k]=process.env[k];
Object.assign(env,{CODEX_HOME:home,HOME:home,USERPROFILE:home,APPDATA:join(home,'AppData','Roaming'),LOCALAPPDATA:join(home,'AppData','Local'),HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost',RUST_LOG:'off'});
const exe='C:/Users/oneca/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
const report={transport:'stdio://',isolatedHome:true,modelRequests:0,results:[],stderrBytes:0,stderrLines:0,parseErrors:0,notifications:[],forcedStop:false};
const p=spawn(exe,['app-server','--listen','stdio://'],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
let exited=false; const closed=new Promise(resolve=>p.on('close',(code,signal)=>{exited=true;report.exit={code,signal};resolve();}));
p.on('error',e=>{report.spawnError=e.code;});
p.stderr.on('data',b=>{report.stderrBytes+=b.length;report.stderrLines+=b.toString().split('\n').length-1;});
const pending=new Map();let id=0;
createInterface({input:p.stdout}).on('line',line=>{let m;try{m=JSON.parse(line)}catch{report.parseErrors++;return;}if(m.id!==undefined){pending.get(m.id)?.(m);pending.delete(m.id);}else if(m.method&&!report.notifications.includes(m.method)) report.notifications.push(m.method);});
function send(m){p.stdin.write(JSON.stringify(m)+'\n');}
async function request(method,params){const n=++id;const start=Date.now(); const m=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(n);reject(new Error('timeout:'+method));},12000);pending.set(n,v=>{clearTimeout(timer);resolve(v)});send({id:n,method,params});});const row={method,elapsedMs:Date.now()-start,envelopeKeys:Object.keys(m),ok:!m.error};if(m.error){row.errorCode=m.error.code;row.errorMessageLength=String(m.error.message??'').length;}else {row.resultKeys=Object.keys(m.result??{});if(method==='thread/list'){row.dataIsArray=Array.isArray(m.result?.data);row.count=m.result?.data?.length;row.nextCursorIsNull=m.result?.nextCursor===null;}if(method==='config/read'){row.configKeys=Object.keys(m.result?.config??{});row.originsIsObject=typeof m.result?.origins==='object';row.layersCount=m.result?.layers?.length;}}report.results.push(row);return m;}
try{
 await request('thread/list',{limit:1});
 await request('initialize',{clientInfo:{name:'onecarat_cx_probe01',version:'0.0.0'},capabilities:{experimentalApi:false}});
 send({method:'initialized',params:{}});report.initializedSent=true;
 await request('thread/list',{limit:1});
 await request('config/read',{includeLayers:true});
 await request('probe/nonexistent',{});
}catch(e){report.failure=String(e.message).replace(root,'[TEMP]');}
finally{
 p.stdin.end();
 await Promise.race([closed,new Promise(r=>setTimeout(r,4000))]);
 if(!exited){report.forcedStop=true;p.kill();await Promise.race([closed,new Promise(r=>setTimeout(r,4000))]);}
 report.processClosed=exited;
 writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
