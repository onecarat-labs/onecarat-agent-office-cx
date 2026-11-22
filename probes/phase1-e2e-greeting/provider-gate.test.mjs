import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProviderAllowed,officialChatgptBaseUrl as url} from './provider-gate.mjs';

for(const [name,config] of [
  ['default config',{}],
  ['official default',{chatgpt_base_url:url}],
  ['explicit openai',{model_provider:'openai',chatgpt_base_url:url}],
  ['absent override',{chatgpt_base_url:null}]
]) test(name,()=>assert.doesNotThrow(()=>assertProviderAllowed({config})));

for(const [name,value] of [
  ['http','http://chatgpt.com/backend-api/'],
  ['no trailing slash','https://chatgpt.com/backend-api'],
  ['host suffix','https://chatgpt.com.evil.example/backend-api/'],
  ['userinfo','https://chatgpt.com@evil.example/backend-api/'],
  ['query',url+'?token=SECRET'],['fragment',url+'#SECRET'],
  ['extra path',url+'other'],['port','https://chatgpt.com:443/backend-api/'],
  ['leading whitespace',' '+url],['trailing whitespace',url+' '],
  ['loopback','http://127.0.0.1:9'],['object',{url}],['array',[url]]
]) test('reject '+name,()=>assert.throws(()=>assertProviderAllowed({config:{chatgpt_base_url:value}}),{message:'CUSTOM_PROVIDER_REQUIRES_REVIEW'}));

for(const [name,extra] of [
  ['other provider',{model_provider:'other'}],
  ['openai definition',{model_providers:{openai:{}}}],
  ['API URL',{openai_base_url:'https://api.openai.com/v1'}]
]) test('official URL cannot bypass '+name,()=>assert.throws(()=>assertProviderAllowed({config:{chatgpt_base_url:url,...extra}}),{message:'CUSTOM_PROVIDER_REQUIRES_REVIEW'}));

test('rejected config prevents following mock operation without disclosing values',async()=>{
  let nextOperations=0;
  async function connect(config) {assertProviderAllowed({config});nextOperations++;}
  await assert.rejects(connect({chatgpt_base_url:url+'?token=SECRET'}),{message:'CUSTOM_PROVIDER_REQUIRES_REVIEW'});
  assert.equal(nextOperations,0);
  await connect({chatgpt_base_url:url});
  assert.equal(nextOperations,1);
});
