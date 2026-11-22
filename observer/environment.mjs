// Deliberately excludes NODE_OPTIONS, preload paths, API keys and service tokens.
const allowed=new Set(['SYSTEMROOT','WINDIR','PATH','PATHEXT','USERPROFILE','TEMP','TMP','CODEX_HOME','CX_SESSIONS_DIR']);
export function viewerEnvironment(source=process.env,nodePath){
 const result={};for(const [key,value] of Object.entries(source))if(allowed.has(key.toUpperCase())&&typeof value==='string')result[key.toUpperCase()]=value;
 if(nodePath)result.CX_NODE_EXE=nodePath;
 return result;
}
