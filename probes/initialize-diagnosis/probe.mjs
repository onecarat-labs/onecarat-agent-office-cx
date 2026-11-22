import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {executable,cleanEnvironment} from '../../src/codex.mjs';
import {Rpc} from '../../src/rpc.mjs';
const run=mkdtempSync(join(import.meta.dirname,'run-'));
const env=cleanEnvironment();
if(process.argv.includes('--explicit-home'))env.HOME=process.env.USERPROFILE;
if(process.argv.includes('--home-pair'))for(const k of ['HOMEDRIVE','HOMEPATH'])if(process.env[k])env[k]=process.env[k];
if(process.argv.includes('--isolated')){const home=join(run,'home');mkdirSync(home);env.CODEX_HOME=home;}
const args=['-c','approval_policy="on-request"','-c','sandbox_mode="read-only"','-c','web_search="disabled"','-c','check_for_update_on_startup=false','-c','analytics.enabled=false','-c','feedback.enabled=false','-c','otel.exporter="none"','-c','history.persistence="none"'];
for(const f of ['goals','hooks','apps','plugins','remote_plugin','memories','shell_snapshot','multi_agent','multi_agent_v2','skill_mcp_dependency_install'])args.push('--disable',f);
args.push('app-server','--listen','stdio://');
const report={date:new Date().toISOString(),isolated:process.argv.includes('--isolated'),args,envNames:Object.keys(env),events:[],stderrCategories:[],modelCalls:0};
const child=spawn(executable(),args,{cwd:run,env,windowsHide:true,stdio:['pipe','pipe','pipe']});report.pid=child.pid;
let stderr='';child.stderr.on('data',c=>{stderr=(stderr+c).slice(-32000);});
child.on('error',e=>report.spawnError=e.code);
let closed=false;const done=new Promise(ok=>child.once('close',(code,signal)=>{closed=true;report.exitCode=code;report.signal=signal;report.events.push('child-close');ok();}));
child.stdout.on('end',()=>report.events.push('stdout-end'));
const rpc=new Rpc(child.stdout,child.stdin);rpc.on('disconnect',code=>report.events.push(code));
rpc.on('notification',()=>report.events.push('notification'));rpc.on('request',()=>report.events.push('server-request'));
try{await rpc.call('initialize',{clientInfo:{name:'onecarat_cx',version:'0.1.0'},capabilities:{experimentalApi:false}});report.initialize=true;}
catch(e){report.initialize=false;report.rpcError=e.message;}
finally{
 report.closedBeforeCleanup=closed;child.stdin.end();const timer=setTimeout(()=>{if(!closed){report.killedByProbe=true;child.kill();}},1500);await done;clearTimeout(timer);
 report.stderrBytes=Buffer.byteLength(stderr);
 for(const [code,re] of Object.entries({CONFIG_ERROR:/error (?:loading|parsing|reading) config|failed to (?:load|parse|read).*config/i,PERMISSION_DENIED:/permission denied|access is denied|os error 5/i,UNKNOWN_FEATURE:/unknown feature/i,INVALID_TYPE:/invalid type/i,INVALID_VALUE:/invalid value/i,UNEXPECTED_ARGUMENT:/unexpected argument/i,WORKSPACE:/workspace/i,NOT_FOUND:/not found|os error 2/i,PANIC:/panicked/i,TRUST:/trust/i,MCP:/mcp/i,APPROVAL:/approval/i,SANDBOX:/sandbox/i,SQLITE:/sqlite/i,NETWORK:/network|dns|proxy/i,UNTRUSTED:/untrusted/i,UNSUPPORTED:/unsupported/i}))if(re.test(stderr))report.stderrCategories.push(code);
 // Only fixed diagnostic phrases, no raw stderr/config/account data.
 report.osErrors=[...stderr.matchAll(/os error (\d+)/g)].map(m=>Number(m[1]));
 report.homeResolutionError=stderr.includes('Could not find home directory');
 const vocabulary='error failed initialize initialization config configuration profile profiles feature features experimental unsupported unknown invalid field value expected missing required setting settings enabled disabled approval policy sandbox permission permissions read write file directory path cwd home environment variable cannot could not load loading parse parsing deserialize key token authentication auth provider model service server transport stdio socket port bind address database windows process spawn runtime telemetry otel exporter none local remote shell tool tools mode code security managed requirements constraint constraints rejected analytics feedback history persistence http https stream thread argument unexpected unrecognized request on-request read-only goal goals'.split(' ');
 report.diagnosticWords=stderr.toLowerCase().match(/[a-z][a-z_-]*/g)?.filter(w=>vocabulary.includes(w));
 writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
