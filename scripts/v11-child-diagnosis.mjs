import {Watcher} from '../observer/watcher.mjs';
import {sessionsRoot} from '../observer/binding.mjs';
import {createV11,projectV11,viewV11} from '../observer/model-v11.mjs';
const w=new Watcher(sessionsRoot(),{projector:projectV11,factory:createV11,view:viewV11});
for(let i=0;i<4;i++)await w.tick();
console.log(JSON.stringify([...w.files.values()].map(f=>({idSuffix:f.s.id.slice(-8),parentSuffix:f.s.parent.slice(-8),identity:f.s.identityConfirmed,activity:f.s.activity,children:f.s.children.size,offset:f.offset})),null,2));
