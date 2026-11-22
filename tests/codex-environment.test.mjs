import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cleanEnvironment} from '../src/codex.mjs';
test('explicit Codex home preserves selection and excludes secret environment',()=>{
 const home=mkdtempSync(join(tmpdir(),'cx-home-'));
 const env=cleanEnvironment({CODEX_HOME:home,USERPROFILE:'ignored',OPENAI_API_KEY:'secret',CODEX_API_KEY:'secret',ACCESS_TOKEN:'secret'});
 assert.equal(env.CODEX_HOME,home);assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.CODEX_API_KEY,undefined);assert.equal(env.ACCESS_TOKEN,undefined);
});
test('default home uses existing profile .codex, never creates or silently falls back',()=>{
 const profile=mkdtempSync(join(tmpdir(),'cx-profile-'));
 assert.throws(()=>cleanEnvironment({USERPROFILE:profile}),/UNAVAILABLE/);mkdirSync(join(profile,'.codex'));
 assert.equal(cleanEnvironment({USERPROFILE:profile}).CODEX_HOME,join(profile,'.codex'));
 assert.throws(()=>cleanEnvironment({USERPROFILE:profile,CODEX_HOME:join(profile,'missing')}),/UNAVAILABLE/);
 assert.throws(()=>cleanEnvironment({CODEX_HOME:'relative'}),/UNRESOLVED/);
 writeFileSync(join(profile,'file'),'fixture');assert.throws(()=>cleanEnvironment({CODEX_HOME:join(profile,'file')}),/UNAVAILABLE/);
});
