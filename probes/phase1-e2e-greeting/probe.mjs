import {mkdirSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Runtime} from '../../src/runtime.mjs';
import {spawnCodex} from '../../src/codex.mjs';
import {serve} from '../../src/server.mjs';
import {assertProviderAllowed} from './provider-gate.mjs';
const root=resolve(import.meta.dirname),marker=join(root,'consumed.json');
if(existsSync(marker))throw Error('AUTHORIZATION_ALREADY_CONSUMED');
const prompt='こんにちは。短く挨拶してください。';
const run=mkdtempSync(join(root,'run-'));mkdirSync(join(run,'workspace'));
const report={started:new Date().toISOString(),modelForwardAttempts:0,events:[],uiStates:[],errors:[]};
let transport,app,browser,target,created=false,stopped=false;
const runtime=new Runtime({directory:join(run,'runtime'),cwd:join(run,'workspace'),allowModel:true,factory:()=>{
  transport=spawnCodex({cwd:join(run,'workspace')});report.pid=transport.pid;report.version=transport.version;
  const rpc=transport.rpc,call=rpc.call.bind(rpc),send=rpc.send.bind(rpc);
  rpc.send=m=>{if(m.method!=='initialized'&&!m.method)throw Error('APPROVAL_REPLY_FORBIDDEN');return send(m);};
  rpc.call=async(method,params)=>{
    report.lastMethod=method;
    if(!['initialize','account/read','config/read','thread/start','turn/start'].includes(method))throw Error('METHOD_FORBIDDEN');
    if(method==='thread/start'){
      if(created)throw Error('SECOND_THREAD_FORBIDDEN');created=true;
      const config={};
      for(const f of ['shell_tool','unified_exec','shell_snapshot','code_mode','code_mode_host','browser_use','browser_use_external','computer_use','in_app_browser','multi_agent','multi_agent_v2','skill_search','skill_mcp_dependency_install','apply_patch_freeform'])config[`features.${f}`]=false;
      params={...params,config,developerInstructions:'For this connection check, answer the user briefly. Do not use any tools, read or write files, execute commands, delegate work, or access external services.'};
    }
    if(method==='turn/start'){
      if(stopped||!target||params.threadId!==target||params.input?.length!==1||params.input[0].type!=='text'||params.input[0].text!==prompt)throw Error('PROMPT_GATE_REJECTED');
      writeFileSync(marker,JSON.stringify({time:new Date().toISOString(),run,threadId:target}),{flag:'wx'});
      report.modelForwardAttempts++;report.forwardedAt=new Date().toISOString();
    }
    const result=await call(method,params);
    if(method==='thread/start'){target=result.thread?.id;report.threadId=target;report.model=result.model;}
    if(method==='turn/start'){report.accepted=true;report.turnId=result.turn?.id;}
    if(method==='account/read')report.auth=result.account?.type==='chatgpt'?'chatgpt':'notChatGPT';
    if(method==='config/read'){
      assertProviderAllowed(result);
    }
    return result;
  };
  rpc.on('request',()=>{report.errors.push('UNEXPECTED_SERVER_REQUEST');stopped=true;runtime.halt('UNEXPECTED_SERVER_REQUEST');});
  rpc.on('notification',m=>{
    const p=m.params??{},id=p.threadId??p.thread?.id;
    if(id&&target&&id!==target){report.errors.push('OTHER_THREAD_EVENT');stopped=true;runtime.halt('OTHER_THREAD_EVENT');return;}
    if(['turn/started','turn/completed','item/started','item/completed','item/agentMessage/delta','thread/started'].includes(m.method)){
      report.events.push({time:new Date().toISOString(),method:m.method,threadId:id,turnId:p.turnId??p.turn?.id,itemId:p.itemId??p.item?.id,type:p.item?.type,status:p.turn?.status});
      if(p.item?.type&&!['userMessage','agentMessage','reasoning','plan'].includes(p.item.type)){report.errors.push('UNEXPECTED_TOOL_ITEM');stopped=true;runtime.halt('UNEXPECTED_TOOL_ITEM');}
      if(m.method==='turn/completed')report.completedStatus=p.turn?.status;
    }
  });return transport;
}});
try{
  const {chromium}=await import(pathToFileURL('C:/work/onecarat-agent-office/node_modules/playwright-core/index.mjs').href);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  app=await serve(runtime);const page=await browser.newPage();page.setDefaultTimeout(15000);
  await page.goto(app.url);
  await page.evaluate(()=>{window.cxStates=[];new MutationObserver(()=>{const s=document.querySelector('.agent-state')?.textContent;if(s&&window.cxStates.at(-1)!==s)window.cxStates.push(s);}).observe(document.body,{childList:true,subtree:true,characterData:true});});
  await page.getByRole('button',{name:'接続',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#new').disabled);
  if(runtime.state.auth!=='chatgpt')throw Error('CHATGPT_REQUIRED');
  await page.getByRole('button',{name:'＋ 新しいセッション'}).click();
  await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  await page.getByLabel('依頼・追加指示').fill(prompt);
  await page.getByRole('button',{name:'依頼を送る'}).click();
  const deadline=Date.now()+90000;
  while(!report.completedStatus&&Date.now()<deadline){if(runtime.state.authGate!=='ready'||stopped)throw Error('AUTH_OR_EXECUTION_STOPPED');await new Promise(r=>setTimeout(r,200));}
  if(!report.completedStatus)throw Error('TURN_COMPLETION_TIMEOUT_NO_RETRY');
  await page.waitForFunction(()=>['実行完了','失敗','中断'].includes(document.querySelector('.agent-state')?.textContent));
  const t=runtime.state.threads[target];
  report.answer=Object.values(t?.turns??{}).flatMap(t=>Object.values(t.items)).filter(i=>i.type==='agentMessage').map(i=>i.text).join('\n');
  report.uiStates=await page.evaluate(()=>window.cxStates);report.uiAnswerMatches=(await page.locator('#messages').innerText()).includes(report.answer)&&!!report.answer;
  await page.screenshot({path:join(run,'office.png'),fullPage:true});
}catch(e){report.errors.push(/^[A-Z_]{3,80}$/.test(e.message)?e.message:'UI_OR_STARTUP_FAILURE');report.runtimeError=runtime.state.error;report.authGate=runtime.state.authGate;}
finally{
  stopped=true;if(browser)await browser.close();if(app)await app.close();else await runtime.stop();
  report.diagnostics=transport?.diagnostics;
  report.ownedProcessStopped=!runtime.stopFailure;report.finished=new Date().toISOString();
  writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
