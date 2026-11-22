// Static, loopback-only mock viewer. No Runtime/Codex imports or writable APIs.
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export async function servePhase2({port=0}={}){
  const files={'/':'index.html','/app.mjs':'app.mjs','/domain.mjs':'domain.mjs','/style.css':'style.css'};
  let origin;const sockets=new Set();
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if(req.headers.host!==origin?.slice(7)||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('FORBIDDEN');return;}
    const file=Object.hasOwn(files,req.url)?files[req.url]:null;
    if(req.method!=='GET'||!file){res.writeHead(404);res.end('NOT_FOUND');return;}
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
    res.end(readFileSync(new URL('../ui2/'+file,import.meta.url)));
  });
  server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});
  origin='http://127.0.0.1:'+server.address().port;
  return {url:origin,async close(){for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const app=await servePhase2();
  console.log('Phase 2 MOCK / モデル・外部送信なし / 保存なし\n'+app.url+'\n終了: Ctrl+C。再読込でデータは消えます。');
  let closing=false;const close=async()=>{if(closing)return;closing=true;await app.close();};process.on('SIGINT',close);process.on('SIGTERM',close);
}
