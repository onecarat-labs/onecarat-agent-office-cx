import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Runtime } from '../src/runtime.mjs';
import { spawnCodex, cleanEnvironment } from '../src/codex.mjs';
// Isolated connection test: no user auth, no Thread creation, no Turn or resume.
mkdirSync('.cx/connection-tests',{recursive:true});mkdirSync('artifacts',{recursive:true});
const root=mkdtempSync(resolve('.cx/connection-tests/run-')),home=join(root,'home'),tmp=join(root,'tmp');
mkdirSync(home);mkdirSync(tmp);
writeFileSync(join(home,'config.toml'),'model_provider = "probe_local"\nchatgpt_base_url = "http://127.0.0.1:9"\n[model_providers.probe_local]\nname = "Disabled model endpoint"\nbase_url = "http://127.0.0.1:9/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n');
const env=cleanEnvironment();Object.assign(env,{CODEX_HOME:home,USERPROFILE:home,APPDATA:home,LOCALAPPDATA:home,TEMP:tmp,TMP:tmp,HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'});
const methods=[];let transport;
const runtime=new Runtime({directory:join(root,'state'),cwd:root,factory:()=>{
  transport=spawnCodex({cwd:root,env});const call=transport.rpc.call.bind(transport.rpc);
  transport.rpc.call=(method,params)=>{if(!['initialize','account/read','config/read'].includes(method))throw Error('PROBE_METHOD_BLOCKED');methods.push(method);return call(method,params);};return transport;
}});
const result={date:new Date().toISOString(),version:'0.169.0',modelCalls:0,methods,isolated:true};
try {await runtime.connect();result.connection=runtime.state.connection;result.auth=runtime.state.auth;result.pid=transport.pid;}
catch(e){result.error=runtime.safeError(e);result.diagnostics=transport?.diagnostics;process.exitCode=1;}
finally{await runtime.stop();result.stopped=true;writeFileSync('artifacts/connection-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
