import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {executable,cleanEnvironment} from '../../src/codex.mjs';
import {Rpc} from '../../src/rpc.mjs';
const gate=spawnSync('powershell.exe',['-NoProfile','-Command','([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],{windowsHide:true,encoding:'utf8'});
if(gate.status!==0||gate.stdout.trim()!=='False')throw Error('NORMAL_USER_REQUIRED');
const run=mkdtempSync(join(import.meta.dirname,'access-')),env=cleanEnvironment();
const args=['-c','approval_policy="on-request"','-c','sandbox_mode="read-only"','-c','web_search="disabled"','-c','check_for_update_on_startup=false','-c','analytics.enabled=false','-c','feedback.enabled=false','-c','otel.exporter="none"','-c','history.persistence="none"'];
if(process.argv.includes('--local-state'))args.push('-c',`sqlite_home=${JSON.stringify(join(run,'state').replaceAll('\\','/'))}`,'-c',`log_dir=${JSON.stringify(join(run,'logs').replaceAll('\\','/'))}`);
for(const f of ['goals','hooks','apps','plugins','remote_plugin','memories','shell_snapshot','multi_agent','multi_agent_v2','skill_mcp_dependency_install'])args.push('--disable',f);
args.push('app-server','--listen','stdio://');
const result={date:new Date().toISOString(),normalUser:true,localState:process.argv.includes('--local-state'),methods:['initialize'],modelCalls:0};
const p=spawn(executable(),args,{cwd:run,env,windowsHide:true,stdio:['pipe','pipe','pipe']});result.pid=p.pid;
let stderr='';p.stderr.on('data',c=>stderr=(stderr+c).slice(-32000));
const done=new Promise(ok=>p.once('close',(code,signal)=>{result.exitCode=code;result.signal=signal;ok();}));
const rpc=new Rpc(p.stdout,p.stdin);
try{await rpc.call('initialize',{clientInfo:{name:'onecarat_cx',version:'0.1.0'},capabilities:{experimentalApi:false}});result.initialize=true;}catch(e){result.error=e.message;}
finally{
 p.stdin.end();const timer=setTimeout(()=>p.kill(),1500);await done;clearTimeout(timer);
 // Fixed words/filenames only. Never persist raw stderr, paths, tokens or config values.
 const words=new Set('error failed failure initialize initialization config configuration profile feature unsupported unknown invalid expected missing required settings permission permissions access denied read reading write writing create creating open opening directory file path home cannot could not load loading lock database sqlite state logs log runtime temporary temp cache session auth credentials secrets sql migration migrate telemetry sandbox os operation move rename canonicalize remove copying copy install setup status failed to update bootstrap'.split(' '));
 result.lines=stderr.split(/\r?\n/).filter(Boolean).map(line=>({words:line.toLowerCase().match(/[a-z][a-z_-]*/g)?.filter(w=>words.has(w)),osErrors:[...line.matchAll(/os error (\d+)/g)].map(m=>Number(m[1])),knownFiles:['auth.json','config.toml','state_5.sqlite','state_6.sqlite','logs_1.sqlite','.codex','tmp','arg0','sessions','log'].filter(s=>line.includes(s))}));
 result.stderrBytes=Buffer.byteLength(stderr);writeFileSync(join(run,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
