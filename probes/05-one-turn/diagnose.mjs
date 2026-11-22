import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {exe} from '../03-remote-tui/inspect.mjs';
const root=import.meta.dirname;
const base={};for(const k of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'])if(process.env[k])base[k]=process.env[k];
const rows=[];
for(const [name,cwd,env] of [
 ['original',root,base],
 ['home-variables',root,{...base,HOMEDRIVE:process.env.HOMEDRIVE,HOMEPATH:process.env.HOMEPATH}],
 ['system32',join(process.env.SystemRoot,'System32'),base],
 ['explicit-existing-codex-home',root,{...base,CODEX_HOME:join(process.env.USERPROFILE,'.codex')}],
]){
 const r=spawnSync(exe,['login','status'],{cwd,env,windowsHide:true,encoding:'utf8',timeout:15000});
 const output=(r.stdout??'')+'\n'+(r.stderr??'');
 const line=output.split(/\r?\n/).find(l=>/^Error loading configuration:/.test(l));
 const safe=line?.replace(/`[^`]*`|'[^']*'|"[^"]*"/g,'[VALUE]').replace(/[A-Za-z]:[\\/][^\s]+/g,'[PATH]').replace(/(?:sk-|Bearer\s+)\S+/gi,'[SECRET]').slice(0,400);
 rows.push({name,status:r.status,chatgpt:/Logged in using ChatGPT/i.test(output),configError:safe});
}
writeFileSync(join(root,'diagnosis.json'),JSON.stringify({timestamp:new Date().toISOString(),rows,modelRequests:0},null,2));console.log(JSON.stringify(rows,null,2));
