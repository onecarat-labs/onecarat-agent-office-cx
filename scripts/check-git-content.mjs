import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
const worktree=process.argv.includes('--worktree');
const files=[...new Set(execFileSync('git',worktree?['ls-files','--cached','--others','--exclude-standard','-z']:['ls-files','--cached','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
if(!files.length){console.error('No staged/tracked files to inspect.');process.exit(1);}
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],['api-key',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],['aws-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],['jwt',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/]];
let findings=[];
for(const path of files){
 if(/^(?:\.cx|artifacts|dist|release|node_modules)\//.test(path)||/(?:^|\/)(?:auth\.json|\.env|.*\.sqlite(?:-wal|-shm)?)$/.test(path))findings.push({path,kind:'excluded-data'});
 if(statSync(path).size>5*1024*1024)findings.push({path,kind:'large-file'});
 if(/\.(?:png|ico)$/.test(path))continue;
 // Inspect index content, not a potentially different working-tree file.
 const content=worktree?readFileSync(path,'utf8'):execFileSync('git',['show',':'+path],{encoding:'utf8',maxBuffer:8*1024*1024});
 for(const [kind,re] of rules)if(re.test(content))findings.push({path,kind});
}
console.log(JSON.stringify({mode:worktree?'working-tree candidates':'index',files:files.length,findings},null,2));
console.log('This pattern check does not guarantee absence of every kind of secret.');
if(findings.length)process.exit(1);
