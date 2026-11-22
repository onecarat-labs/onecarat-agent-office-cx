import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {exe} from '../03-remote-tui/inspect.mjs';
const env={};for(const k of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
env.CODEX_HOME=join(process.env.USERPROFILE,'.codex');
const r=spawnSync(exe,['features','list'],{cwd:import.meta.dirname,env,windowsHide:true,encoding:'utf8',timeout:10000});
const lines=(r.stdout??'').split(/\r?\n/).filter(l=>/shell|exec|patch|tool|hook|plugin|apps|mcp|agent|browser|computer|search|memory|code_mode/.test(l));
const report={exitCode:r.status,features:lines};writeFileSync(join(import.meta.dirname,'feature-options.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
