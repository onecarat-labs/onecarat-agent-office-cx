import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {exe,environment} from '../03-remote-tui/inspect.mjs';
const root=import.meta.dirname, env=environment(join(root,'schema-home'));
const args=process.argv.includes('--generate')?['app-server','generate-json-schema','--out',join(root,'schema')]:['app-server','generate-json-schema','--help'];
const r=spawnSync(exe,args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:30000});
writeFileSync(join(root,'schema-command.json'),JSON.stringify({args,status:r.status,stdout:r.stdout,stderrBytes:Buffer.byteLength(r.stderr??'')},null,2));
console.log(r.stdout);console.log('status',r.status);
