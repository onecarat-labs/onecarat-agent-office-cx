// Authentication is read only by the official CLI; no auth file is opened here.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {exe} from '../03-remote-tui/inspect.mjs';
const root=import.meta.dirname;
mkdirSync(root,{recursive:true});
const env={};
for(const k of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
if(process.env.CODEX_HOME)env.CODEX_HOME=process.env.CODEX_HOME;
const commands=[];
for(const args of [['--version'],['login','status']]){
 const r=spawnSync(exe,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:15000});
 const output=(r.stdout??'')+'\n'+(r.stderr??'');
 commands.push({command:args.join(' '),exitCode:r.status,errorCode:r.error?.code,
 version:args[0]==='--version'?/codex-cli [\d.]+/.exec(output)?.[0]:undefined,
 chatgptLogin:/logged in using chatgpt/i.test(output),apiKeyLogin:/logged in using an? api key/i.test(output),
 notLoggedIn:/not logged in/i.test(output),diagnostics:{
 accessDenied:/access is denied|access denied|permission denied|os error 5/i.test(output),
 configError:/error loading config|failed to load config|error parsing|failed to parse|invalid config/i.test(output),
 authReadError:/read.*auth|auth.*read|credential/i.test(output),
 missingFile:/not found|cannot find|os error 2/i.test(output),
 managedAuth:/managed auth|managed_auth/i.test(output),
 proxyError:/proxy/i.test(output),
 errorLinePrefixes:output.split(/\r?\n/).filter(l=>/^error/i.test(l)).map(l=>l.split(':')[0].replace(/[^a-zA-Z ]/g,'').slice(0,80))
 },rawOutputStored:false});
}
const report={timestamp:new Date().toISOString(),commands,modelRequests:0,authFilesReadByProbe:false,authFilesCopied:false};
writeFileSync(join(root,'preflight-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
