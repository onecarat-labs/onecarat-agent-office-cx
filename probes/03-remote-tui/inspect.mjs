import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const root = import.meta.dirname;
export const exe = 'C:/Users/oneca/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
export function environment(dir) {
  mkdirSync(dir, { recursive:true });
  const env = {};
  for (const k of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT']) if(process.env[k]) env[k]=process.env[k];
  Object.assign(env, { CODEX_HOME:dir, USERPROFILE:dir, APPDATA:join(dir,'roaming'), LOCALAPPDATA:join(dir,'local'), TEMP:dir, TMP:dir,
    HTTP_PROXY:'http://127.0.0.1:9', HTTPS_PROXY:'http://127.0.0.1:9', ALL_PROXY:'http://127.0.0.1:9', NO_PROXY:'127.0.0.1', RUST_LOG:'off' });
  writeFileSync(join(dir,'config.toml'), `check_for_update_on_startup = false
model_provider = "probe_local"
chatgpt_base_url = "http://127.0.0.1:9"
cli_auth_credentials_store = "file"
[model_providers.probe_local]
name = "Disabled local endpoint"
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
  return env;
}
if(process.argv[1]?.endsWith('inspect.mjs')) {
  const env=environment(join(root,'inspection-home'));
  const report={timestamp:new Date().toISOString(),node:process.version,commands:[]};
  for(const args of [['--version'],['--help'],['app-server','--help'],['resume','--help']]) {
    const r=spawnSync(exe,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:10000});
    report.commands.push({args,status:r.status,error:r.error?.code,stdout:r.stdout,stderrBytes:Buffer.byteLength(r.stderr??'')});
  }
  writeFileSync(join(root,'help.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
