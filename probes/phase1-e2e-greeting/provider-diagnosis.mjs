import {strict as assert} from 'node:assert';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnCodex} from '../../src/codex.mjs';
import {assertProviderAllowed} from './provider-gate.mjs';

// rust-v0.169.0/codex-rs/model-provider/src/chatgpt_base_url.rs
const officialDefault='https://chatgpt.com/backend-api/';
const matchesOfficialDefault=result=>result.config?.chatgpt_base_url===officialDefault;

// Retain the original diagnostic flags for comparison with previous reports.
function classify(result) {
  const c=result.config??{}, provider=c.model_provider??'openai';
  return {
    nonOpenAIProvider:provider!=='openai',
    providerDefinitionPresent:Boolean(c.model_providers?.[provider]),
    chatgptBaseUrlPresent:Boolean(c.chatgpt_base_url),
    openaiBaseUrlPresent:Boolean(c.openai_base_url)
  };
}
if(process.argv.includes('--self-test')) {
  for(const [config,index] of [[{},-1],[{model_provider:'other'},0],[{model_providers:{openai:{}}},1],[{chatgpt_base_url:'SECRET'},2],[{openai_base_url:'SECRET'},3]]) {
    const result=classify({config});
    assert.deepEqual(Object.values(result),[0,1,2,3].map(i=>i===index));
    assert.equal(JSON.stringify(result).includes('SECRET'),false);
  }
  for(const [value,expected] of [[officialDefault,true],[undefined,false],['https://chatgpt.com/backend-api',false],['https://chatgpt.com.evil.example/backend-api/',false],[officialDefault+'?token=SECRET',false],[officialDefault+'#SECRET',false]]) {
    assert.equal(matchesOfficialDefault({config:{chatgpt_base_url:value}}),expected);
  }
  console.log(JSON.stringify({tests:11,passed:11,modelCalls:0,processesStarted:0}));
} else {
  const run=mkdtempSync(join(import.meta.dirname,'provider-diagnosis-'));
  const cwd=join(run,'workspace');mkdirSync(cwd);
  const report={time:new Date().toISOString(),methods:[],modelCalls:0,threadOperations:0};
  let transport;
  try {
    transport=spawnCodex({cwd});report.pid=transport.pid;report.version=transport.version;
    report.methods.push('initialize');
    await transport.rpc.call('initialize',{clientInfo:{name:'onecarat_cx',version:'0.1.0'},capabilities:{experimentalApi:false}});
    transport.rpc.send({method:'initialized',params:{}});
    report.methods.push('config/read');
    const result=await transport.rpc.call('config/read',{includeLayers:false});
    report.conditions=classify(result);
    report.chatgptBaseUrlMatchesOfficialDefault=matchesOfficialDefault(result);
    try {assertProviderAllowed(result);report.wouldBlock=false;}
    catch {report.wouldBlock=true;}
  } catch(e) {
    report.error=/^[A-Z_]{3,80}$/.test(e.message)?e.message:'DIAGNOSTIC_FAILED';
  } finally {
    if(transport){await transport.stop();report.diagnostics=transport.diagnostics;}
    report.stopped=true;
    writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }
}
