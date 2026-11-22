// Only known structural keys and their types; unknown keys/values are never saved.
const known=new Set(['id','method','params','threadId','input','type','text','text_elements','textElements','byteRange','placeholder','start','end','cwd','model','effort','summary','personality','approvalPolicy','sandboxPolicy','outputSchema','collaborationMode','mode','settings','baseInstructions','developerInstructions','serviceTier']);
export function shape(value,depth=0){
 if(value===null)return 'null';
 if(depth>5)return 'depth-limit';
 if(Array.isArray(value))return {type:'array',count:value.length,items:value.slice(0,10).map(v=>shape(v,depth+1))};
 if(typeof value==='object')return {type:'object',fields:Object.fromEntries(Object.entries(value).filter(([k])=>known.has(k)).map(([k,v])=>[k,shape(v,depth+1)])),unknownKeyCount:Object.keys(value).filter(k=>!known.has(k)).length};
 return typeof value;
}
export const threadIdForLog=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id:null;
