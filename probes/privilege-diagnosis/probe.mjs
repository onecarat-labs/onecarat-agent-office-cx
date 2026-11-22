// Diagnostic only. No product imports, Codex launch, auth access or model calls.
import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
const command='([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)';
const options={windowsHide:true,encoding:'utf8'};
const p=spawnSync('powershell.exe',['-NoProfile','-Command',command],options);
const q=spawnSync('whoami.exe',['/groups','/fo','csv','/nh'],options);
const language=spawnSync('powershell.exe',['-NoProfile','-Command','[string]$ExecutionContext.SessionState.LanguageMode'],options);
const report={time:new Date().toISOString(),node:process.version,nodePid:process.pid,parentPid:process.ppid,
  command,status:p.status,signal:p.signal,spawnError:p.error?.code,stdout:p.stdout,stderr:p.stderr,
  administrator:p.status===0&&['True','False'].includes(p.stdout?.trim())?p.stdout.trim()==='True':null,
  productGatePass:p.status===0&&p.stdout?.trim()==='False',
  integrity:{status:q.status,sids:[...new Set((q.stdout??'').match(/S-1-16-\d+/g)??[])],administratorGroupPresent:(q.stdout??'').includes('S-1-5-32-544')},
  language:{status:language.status,stdout:language.stdout,stderr:language.stderr},
  codexStarted:false,modelCalls:0};
const run=mkdtempSync(join(import.meta.dirname,'run-'));
writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
