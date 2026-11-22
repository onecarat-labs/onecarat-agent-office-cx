import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Runtime} from '../src/runtime.mjs';
import {mockFactory} from '../src/mock.mjs';
function setup(read){let reads=0;const methods=[];const directory=mkdtempSync(join(tmpdir(),'cx-init-'));let runtime;
runtime=new Runtime({directory,cwd:directory,allowModel:true,factory:()=>{const t=mockFactory(),call=t.rpc.call;t.rpc.call=async(m,p)=>{methods.push(m);if(m==='account/read')return read(++reads,t.rpc,runtime);return call(m,p);};return t;}});
return {runtime,methods,reads:()=>reads};}
const account={type:'chatgpt',email:'fixture@example.invalid',workspaceName:'fixture'};
test('initial update invalidates in-flight read; two subsequent reads establish readiness',async()=>{
const {runtime:r,methods,reads}=setup(async(n,rpc,r)=>{
assert.equal(r.state.authGate,'blocked');await assert.rejects(r.create());await assert.rejects(r.submit('x','fixture'));await assert.rejects(r.answer('x','accept'));await assert.rejects(r.answer('x','decline'));
if(n===1)rpc.emit('notification',{method:'account/updated',params:{authMode:'chatgpt'}});return {account};});
await r.connect();assert.equal(reads(),3);assert.equal(r.state.authGate,'ready');assert.ok(methods.every(m=>['initialize','config/read','account/read'].includes(m)));
r.rpc.emit('notification',{method:'account/updated',params:{authMode:'chatgpt'}});assert.equal(r.state.authGate,'blocked');await r.stop();
});
for(const mode of [null,'apikey',undefined])test(`initial unknown or non-ChatGPT notification ${mode} stops`,async()=>{
const {runtime:r}=setup((n,rpc)=>{rpc.emit('notification',{method:'account/updated',params:{authMode:mode}});return {account};});
await assert.rejects(r.connect());assert.equal(r.state.authGate,'blocked');await r.stop();});
test('initial update storm is bounded and never enables operations',async()=>{
const {runtime:r,reads}=setup((n,rpc)=>{rpc.emit('notification',{method:'account/updated',params:{authMode:'chatgpt'}});return {account};});
await assert.rejects(r.connect(),/AUTH_INITIALIZATION_UNSTABLE/);assert.equal(reads(),4);assert.equal(r.state.authGate,'blocked');await r.stop();});
test('different initial account observations stop instead of adopting new account',async()=>{
const {runtime:r}=setup(n=>({account:{...account,email:n===1?'a@example.invalid':'b@example.invalid'}}));
await assert.rejects(r.connect(),/AUTH_CHANGED_DURING_CONNECT/);assert.equal(r.state.authGate,'blocked');await r.stop();});
test('initial read failure and null account never enable readiness',async()=>{
for(const response of [null,'failure']){const {runtime:r}=setup(()=>{if(response==='failure')throw Error('RPC_REJECTED');return {account:null};});await assert.rejects(r.connect());assert.equal(r.state.authGate,'blocked');await r.stop();}});
test('stop during initial read rejects late success without reopening gate',async()=>{
let release;const {runtime:r}=setup(()=>new Promise(ok=>release=ok));const p=r.connect(),rejected=assert.rejects(p);while(!release)await new Promise(ok=>setImmediate(ok));await r.stop();release({account});await rejected;assert.equal(r.state.authGate,'blocked');});
