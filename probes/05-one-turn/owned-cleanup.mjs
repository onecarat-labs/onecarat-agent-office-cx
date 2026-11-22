export async function stopOwnedChildren(children,wait=ms=>new Promise(r=>setTimeout(r,ms))){
 for(const c of [...children].reverse()){
  if(!c.row.closed){c.row.stopMethod='owned-child.kill';try{c.p.kill();}catch{c.row.stopError=true;}}
  await Promise.race([c.closed,wait(3000)]);
  if(!c.row.closed){try{c.p.kill();}catch{c.row.stopError=true;}await Promise.race([c.closed,wait(3000)]);}
 }
 return children.every(c=>c.row.closed);
}
