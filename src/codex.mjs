import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { Rpc } from './rpc.mjs';

export function executable() {
  const candidate = process.env.CX_CODEX_EXE;
  if (candidate && isAbsolute(candidate) && existsSync(candidate) && /[\\/]codex\.exe$/i.test(candidate)) return candidate;
  const npm = join(process.env.APPDATA ?? '', 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
  if (existsSync(npm)) return npm;
  throw Error('CODEX_EXE_NOT_FOUND');
}
export function cleanEnvironment(source = process.env) {
  const env = {};
  for (const k of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP']) if (source[k]) env[k] = source[k];
  // Explicitly preserve the user's selected home; never copy credentials or create a fallback home.
  const home=source.CODEX_HOME || (source.USERPROFILE && isAbsolute(source.USERPROFILE) ? join(source.USERPROFILE,'.codex') : null);
  if(!home || !isAbsolute(home))throw Error('CODEX_HOME_UNRESOLVED');
  try { if(!statSync(home).isDirectory())throw Error(); } catch {throw Error('CODEX_HOME_UNAVAILABLE');}
  env.CODEX_HOME=home;
  env.RUST_LOG = 'off'; return env;
}
export function spawnCodex({ cwd, env = cleanEnvironment(), exe = executable() }) {
  const systemRoot=process.env.SystemRoot||process.env.SYSTEMROOT;
  if(!systemRoot||!isAbsolute(systemRoot))throw Error('SYSTEM_ROOT_UNRESOLVED');
  const privilege = spawnSync(join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-Command','([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],{windowsHide:true,encoding:'utf8'});
  if (privilege.status !== 0 || privilege.stdout.trim() !== 'False') throw Error('NORMAL_USER_REQUIRED');
  const version = spawnSync(exe,['--version'],{ cwd, env, windowsHide:true, encoding:'utf8', timeout:10000 });
  if (version.stdout?.trim() !== 'codex-cli 0.169.0') throw Error('UNSUPPORTED_CODEX_VERSION');
  const args = ['-c','approval_policy="on-request"','-c','sandbox_mode="read-only"','-c','web_search="disabled"',
    '-c','check_for_update_on_startup=false','-c','analytics.enabled=false','-c','feedback.enabled=false',
    '-c','otel.exporter="none"','-c','history.persistence="none"'];
  // Runtime never invokes resume. Disable autonomous/optional capabilities for phase 1.
  for (const f of ['goals','hooks','apps','plugins','remote_plugin','memories','shell_snapshot','multi_agent','multi_agent_v2','skill_mcp_dependency_install']) args.push('--disable',f);
  args.push('app-server','--listen','stdio://');
  const child = spawn(exe,args,{ cwd, env, windowsHide:true, stdio:['pipe','pipe','pipe'] });
  const diagnostics=[];
  child.stderr.on('data',chunk=>{
    // Only a fixed CLI error category and feature identifier may leave stderr.
    const match=chunk.toString().match(/Unknown feature flag:\s*([a-z_]+)/i);
    if(match)diagnostics.push({code:'UNKNOWN_FEATURE',feature:match[1]});
    const s=chunk.toString();
    for(const [code,re] of Object.entries({HOME_UNRESOLVED:/Could not find home directory/i,ACCESS_DENIED:/permission denied|access is denied|os error 5/i,CONFIG_FAILURE:/error.*config|failed.*config/i,HOME_UNAVAILABLE:/CODEX_HOME.*(?:exist|directory|canonicalize)/i}))if(re.test(s))diagnostics.push({code});
  });
  const rpc = new Rpc(child.stdout,child.stdin);
  child.on('error',()=>rpc.close('CODEX_START_FAILED'));
  child.on('close',(code,signal)=>{diagnostics.push({code:'PROCESS_EXIT',exitCode:code,signal});rpc.close('CODEX_EXITED');});
  let stopped = false;
  return { rpc, pid:child.pid, diagnostics, version:'0.169.0', async stop() {
    if (stopped) return; stopped = true;
    rpc.close(); child.stdin.end();
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(()=>child.kill(),1500);
      child.once('close',()=>{clearTimeout(timer);resolve();});
    });
  }};
}
