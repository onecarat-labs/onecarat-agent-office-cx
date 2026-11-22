import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Runtime } from './runtime.mjs';
import { spawnCodex } from './codex.mjs';
import { mockFactory } from './mock.mjs';

const publicRoot=resolve(import.meta.dirname,'../ui');
const equal=(a,b)=>typeof a==='string'&&a.length===b.length&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function serve(runtime,{port=0}={}) {
  const token=randomBytes(32).toString('hex'), cookie=randomBytes(32).toString('hex');
  const sockets=new Set(); let origin;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    if(req.headers.host!==origin?.slice(7))return json(403,{error:'HOST_DENIED'});
    const path=req.url?.split('?')[0];
    if(!path?.startsWith('/api/')) {
      const files={'/':'index.html','/app.mjs':'app.mjs','/style.css':'style.css'};
      if(req.method!=='GET'||!files[path])return json(404,{error:'NOT_FOUND'});
      res.setHeader('Content-Type',path.endsWith('.mjs')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
      res.end(readFileSync(join(publicRoot,files[path])));return;
    }
    if(req.headers.origin && req.headers.origin!==origin)return json(403,{error:'ORIGIN_DENIED'});
    if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['x-cx-request']!=='1'||req.headers['content-type']!=='application/json'))return json(403,{error:'CSRF_DENIED'});
    let body={};
    try {
      if(req.method==='POST'){
        let bytes=0;const chunks=[];
        for await(const c of req){bytes+=c.length;if(bytes>65536){json(413,{error:'BODY_TOO_LARGE'});return;}chunks.push(c);}
        body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      }
      if(path==='/api/session'&&req.method==='POST') {
        if(!equal(body.token,token))return json(403,{error:'AUTH_REQUIRED'});
        res.setHeader('Set-Cookie',`cx_${server.address().port}=${cookie}; HttpOnly; SameSite=Strict; Path=/`);return json(200,{ok:true});
      }
      const cookieName=`cx_${server.address().port}=`;
      const c=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName))?.slice(cookieName.length);
      if(!equal(c,cookie))return json(401,{error:'AUTH_REQUIRED'});
      if(path==='/api/state'&&req.method==='GET')return json(200,runtime.snapshot());
      if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
      if(!['/api/connect','/api/disconnect'].includes(path)&&body.boundary!==runtime.snapshot().boundary)return json(409,{error:'STALE_OPERATION'});
      switch(path){
        case '/api/connect':await runtime.connect();break;
        case '/api/disconnect':await runtime.stop();break;
        case '/api/thread/new':await runtime.create();break;
        case '/api/thread/list':await runtime.list();break;
        case '/api/thread/select':runtime.select(body.threadId);break;
        case '/api/thread/read':await runtime.read(body.threadId);break;
        case '/api/turn':await runtime.submit(body.threadId,body.text,body.expectedTurn??null);break;
        case '/api/approval':await runtime.answer(body.id,body.decision);break;
        default:return json(404,{error:'NOT_FOUND'});
      }
      json(200,{ok:true});
    } catch(e){json(400,{error:runtime.safeError(e)});}
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,token,url:`${origin}/#${token}`,async close(){await runtime.stop();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const demo=process.argv.includes('--demo'), allowModel=process.argv.includes('--enable-model');
  const base=resolve('.cx',demo?'demo':'live'), cwd=join(base,'workspace');mkdirSync(cwd,{recursive:true});
  const runtime=new Runtime({factory:demo?mockFactory:()=>spawnCodex({cwd}),directory:base,cwd,allowModel:demo||allowModel,mode:demo?'demo':'live'});
  const app=await serve(runtime);
  console.log(`${demo?'MOCK / モデル未使用':'Office CX / モデル送信 '+(allowModel?'有効':'無効')}\nブラウザで開く（このURLは共有しない）: ${app.url}`);
  let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await app.close();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
