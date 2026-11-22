import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {currentThread,sessionsRoot,resolveLog} from '../observer/binding.mjs';
import {viewerEnvironment} from '../observer/environment.mjs';
const installed = false; // The package builder changes this only in the installed copy.
const args=process.argv.slice(2);
if(!installed&&!args.includes('--development')&&!args.includes('--check')){
 console.error('Development-folder launch is disabled. Use the protected installed copy; see docs/SECURITY_RESPONSE_2026_11_22.md.');process.exit(2);
}
const exe=fileURLToPath(new URL('../dist/v1.1-secure/Onecarat-CX.exe',import.meta.url));
const environment=viewerEnvironment(process.env,process.execPath);
const locale=args.includes('--check')?{stdout:''}:spawnSync(exe,['--language'],{encoding:'utf8',windowsHide:true,env:environment,timeout:5000});
const ja=locale.stdout?.trim()==='ja';const t=(j,e)=>ja?j:e;
try{
 const at=args.indexOf('--thread');
 const id=currentThread(process.env,at>=0?args[at+1]:undefined);
 await resolveLog(sessionsRoot(),id);
 if(args.includes('--check')){console.log(JSON.stringify({binding:'verified',thread:id,language:'unknown'}));}
 else{
  const child=spawn(exe,['--thread',id],{detached:true,stdio:'ignore',windowsHide:false,env:environment});
  child.once('error',()=>{console.error(t('Officeを起動できません。npm.cmd run build を実行してください。','Could not start Office. Run npm.cmd run build.'));process.exitCode=1;});
  child.once('spawn',()=>{console.log(t('Officeへ起動を要求しました。表示先デスクトップは別途確認してください。','Office launch requested. Visible desktop placement must be checked separately.'));child.unref();});
 }
}catch(e){console.error(t('セッションを安全に特定できないため起動しません。Codex内から起動するか、確認済みの --thread ID を指定してください。','Cannot identify the session safely. Launch from Codex or pass a verified --thread ID.')+' ['+(['NO_THREAD','NO_LOG','AMBIGUOUS_LOG','IDENTITY_MISMATCH','SCAN_LIMIT'].includes(e.message)?e.message:'LOG_UNAVAILABLE')+']');process.exitCode=1;}
