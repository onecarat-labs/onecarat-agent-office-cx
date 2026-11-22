import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const destination=resolve('release/onecarat-cx-secure');
const files=['Onecarat-CX.exe',...['model.mjs','watcher.mjs','binding.mjs','model-v11.mjs','main-v11.mjs','safe-file.mjs','environment.mjs'].map(n=>'observer/'+n),'scripts/launch-office.mjs'];
await mkdir(destination,{recursive:true});
for(const file of files){await mkdir(join(destination,file,'..'),{recursive:true});
 if(file==='scripts/launch-office.mjs'){
  const launcher=(await readFile(file,'utf8')).replace('const installed = false;','const installed = true;').replace('../dist/v1.1-secure/Onecarat-CX.exe','../Onecarat-CX.exe');
  await writeFile(join(destination,file),launcher);
 }else await copyFile(join('dist/v1.1-secure',file),join(destination,file));
}
const manifest={format:1,files:[]};
for(const file of files)manifest.files.push({path:file,sha256:createHash('sha256').update(await readFile(join(destination,file))).digest('hex')});
await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Prepared allowlisted local package: '+destination+' (not installed).');
