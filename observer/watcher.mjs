import { readdir, open, lstat, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createSession, project, publicSession } from './model.mjs';
import {openLog} from './safe-file.mjs';
const CHUNK=512*1024, MAX_LINE=512*1024;
export class Watcher {
  constructor(root,{now=()=>Date.now(),limit=64,projector=project,factory=createSession,view=publicSession,pinnedPath=''}={}) {this.root=resolve(root);this.now=now;this.limit=limit;this.files=new Map();this.status='starting';this.skipped=0;this.lastScan=0;this.projector=projector;this.factory=factory;this.view=view;this.pinnedPath=pinnedPath;}
  async discover() {
    const candidates=[];let budget=10000;
    const walk=async(dir,depth)=>{
      const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>b.name.localeCompare(a.name));
      for(const e of entries){if(--budget<0){this.skipped++;break;}if(e.isSymbolicLink())continue;const path=join(dir,e.name);
        if(e.isDirectory()&&depth<3&&/^\d{2,4}$/.test(e.name))await walk(path,depth+1);
        else if(e.isFile()&&/^rollout-.*\.jsonl$/.test(e.name)) {const st=await lstat(path);if(st.mtimeMs>this.now()-86400000||this.files.has(path)) candidates.push({path,mtime:st.mtimeMs});}
      }
    };
    await walk(this.root,0);
    candidates.sort((a,b)=>b.mtime-a.mtime);
    this.skipped+=Math.max(0,candidates.length-this.limit);
    const selected=new Set(candidates.slice(0,this.limit).map(c=>c.path));
    if(this.pinnedPath)selected.add(this.pinnedPath);
    for(const path of this.files.keys())if(!selected.has(path))this.files.delete(path);
    for(const path of selected)if(!this.files.has(path))this.files.set(path,{offset:0,partial:Buffer.alloc(0),dropping:false,initialized:false,s:this.factory(/([a-f0-9-]{36})\.jsonl$/.exec(path)?.[1]||'')});
  }
  parse(f,bytes) {
    let data=Buffer.concat([f.partial,bytes]),start=0;
    for(let n=0;n<data.length;n++)if(data[n]===10){
      if(!f.dropping&&n-start<=MAX_LINE){try{this.projector(f.s,JSON.parse(data.subarray(start,n).toString('utf8')));}catch{this.skipped++;}}
      else this.skipped++;
      f.dropping=false;start=n+1;
    }
    f.partial=data.subarray(start);
    if(f.partial.length>MAX_LINE){f.partial=Buffer.alloc(0);f.dropping=true;}
  }
  async read(path,f) {
    // Recheck links, including parent junctions, before every open. Read-only handle.
    if((await lstat(path)).isSymbolicLink())throw Error('link');
    const rel=relative(await realpath(this.root),await realpath(path));
    if(rel.startsWith('..')||isAbsolute(rel))throw Error('outside');
    const h=await openLog(this.root,path);
    try {
      const st=await h.stat();
      if(st.size<f.offset||f.ino!==undefined&&f.ino!==st.ino){f.offset=0;f.partial=Buffer.alloc(0);f.dropping=false;f.initialized=false;f.s=this.factory(f.s.id);}
      f.ino=st.ino;
      if(!f.initialized){
        // Metadata prefix plus recent tail: never load an unbounded conversation.
        if(st.size>CHUNK*2){const b=Buffer.alloc(CHUNK);const {bytesRead}=await h.read(b,0,b.length,0);const end=b.indexOf(10);if(end>=0)this.parse(f,b.subarray(0,end+1));f.offset=st.size-CHUNK;f.partial=Buffer.alloc(0);f.dropping=true;}
        f.initialized=true;
      }
      const length=Math.min(CHUNK,st.size-f.offset);
      if(length>0){const b=Buffer.alloc(length);const {bytesRead}=await h.read(b,0,length,f.offset);f.offset+=bytesRead;this.parse(f,b.subarray(0,bytesRead));}
    }finally{await h.close();}
  }
  async tick() {
    this.skipped=0;
    try {
      if(!this.lastScan||this.now()-this.lastScan>=3000){await this.discover();this.lastScan=this.now();}
      let failures=0;
      for(const [path,f]of this.files){try{await this.read(path,f);}catch{failures++;f.s.activity='unknown';f.s.at=0;}}
      this.status=failures?'partial':'watching';
    }catch(e){this.status=e.code==='ENOENT'?'missing':'unavailable';this.files.clear();}
    return {status:this.status,skipped:this.skipped,sessions:[...this.files.values()].map(f=>this.view(f.s,this.now())).filter(s=>s.id).sort((a,b)=>Number(!!a.parent)-Number(!!b.parent)||b.at-a.at)};
  }
}
