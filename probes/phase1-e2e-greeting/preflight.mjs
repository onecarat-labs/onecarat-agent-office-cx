import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Runtime} from '../../src/runtime.mjs';
import {spawnCodex} from '../../src/codex.mjs';
const run=mkdtempSync(join(import.meta.dirname,'preflight-'));mkdirSync(join(run,'workspace'));
const report={time:new Date().toISOString(),methods:[],trace:[],modelCalls:0};let transport;
const trace=(event,details={})=>report.trace.push({time:new Date().toISOString(),event,...details});
const runtime=new Runtime({directory:join(run,'state'),cwd:join(run,'workspace'),factory:()=>{
 transport=spawnCodex({cwd:join(run,'workspace')});report.pid=transport.pid;report.version=transport.version;
 const call=transport.rpc.call.bind(transport.rpc),stop=transport.stop.bind(transport);
 transport.stop=async()=>{trace('owned-stop-requested');await stop();trace('owned-stop-finished');};
 transport.rpc.on('notification',m=>{trace('notification',{method:/^[a-zA-Z/]{1,100}$/.test(m.method)?m.method:'OTHER'});});
 transport.rpc.on('disconnect',reason=>trace('rpc-disconnect',{reason}));
 transport.rpc.call=async(m,p)=>{if(!['initialize','account/read','config/read'].includes(m))throw Error('METHOD_FORBIDDEN');report.methods.push(m);trace('request',{method:m});try{const result=await call(m,p);trace('response',{method:m});return result;}catch(e){trace('request-failed',{method:m,reason:runtime.safeError(e)});throw e;}};return transport;
}});
const halt=runtime.halt.bind(runtime);
runtime.halt=(reason)=>{trace('runtime-halt',{reason:reason??'AUTH_BOUNDARY_STOPPED',connection:runtime.state.connection,authGate:runtime.state.authGate??'unset'});return halt(reason);};
try{await runtime.connect();report.connection=runtime.state.connection;report.auth=runtime.state.auth;report.authGate=runtime.state.authGate;}
catch(e){report.error=runtime.safeError(e);}
finally{await runtime.stop();report.stopped=!runtime.stopFailure;report.diagnostics=transport?.diagnostics;writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
