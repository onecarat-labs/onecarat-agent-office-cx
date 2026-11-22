import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const executable=fileURLToPath(new URL('../dist/Onecarat-CX.exe',import.meta.url));
const child=spawn(executable,[],{stdio:'ignore',windowsHide:false,env:{...process.env,CX_NODE_EXE:process.execPath}});
child.on('error',()=>{console.error('Build first: npm run build (Windows required)');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
