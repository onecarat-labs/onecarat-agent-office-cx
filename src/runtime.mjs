import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { blankState, thread, project, disconnect, durable, key, text } from './state.mjs';
const supported = new Set(['item/commandExecution/requestApproval','item/fileChange/requestApproval']);

export class Runtime extends EventEmitter {
  constructor({ factory, directory, cwd, allowModel = false, mode = 'live' }) {
    super(); Object.assign(this,{factory,directory,cwd,allowModel,mode});
    this.state=blankState(); this.state.mode=mode; this.state.allowModel=allowModel;
    this.generation=0; this.authGeneration=0; this.quarantined=new Map(); this.stopTasks=new WeakMap();this.busy=false; this.submitting=new Set();this.sentPending=new Set(); this.requestKeys=new Map();
    mkdirSync(directory,{recursive:true});
    try {
      if (existsSync(join(directory,'state.json'))) {
        const saved=JSON.parse(readFileSync(join(directory,'state.json'),'utf8'));
        if (saved.schema!==1) throw Error();
        for(const t of saved.threads??[]) if(key(t.id)) this.quarantined.set(t.id,{id:t.id});
      }
    } catch { this.state.error='STATE_LOAD_FAILED'; }
  }
  changed() {
    this.state.revision=(this.state.revision??0)+1;
    try {
      const saved=durable(this.state); saved.threads=[...this.quarantined.values(),...saved.threads];
      writeFileSync(join(this.directory,'state.tmp'),JSON.stringify(saved));
      renameSync(join(this.directory,'state.tmp'),join(this.directory,'state.json'));
    } catch { this.state.error='STATE_SAVE_FAILED'; }
    this.emit('change');
  }
  snapshot() { return structuredClone({...this.state,boundary:`${this.generation}:${this.authGeneration}`}); }
  halt(reason='AUTH_BOUNDARY_STOPPED') {
    ++this.authGeneration;
    const pending=this.sentPending.size, unsent=this.submitting.size-pending, active=Object.values(this.state.threads).filter(t=>t.activeTurn).length;
    for(const t of Object.values(this.state.threads))this.quarantined.set(t.id,{id:t.id});
    disconnect(this.state);
    this.state.threads={};this.state.approvals={};this.state.events=[];this.state.selected=null;
    this.state.safety={pendingUnknown:pending,unsentCancelled:unsent,activeUnknown:active};
    this.state.error=reason;this.state.authGate='blocked';this.fingerprint=null;
    const transport=this.transport;
    if(transport){
      if(!this.stopTasks.has(transport))this.stopTasks.set(transport,Promise.resolve().then(()=>transport.stop()).catch(()=>{this.stopFailure=true;this.state.error='PROCESS_STOP_UNCONFIRMED';this.changed();}));
      this.stopping=this.stopTasks.get(transport);
    }
    this.changed();
  }
  ticket() { this.connected(); if(this.state.authGate!=='ready'||this.state.auth!=='chatgpt')throw Error('AUTH_BOUNDARY_STOPPED');return {generation:this.generation,auth:this.authGeneration,rpc:this.rpc}; }
  current(t) { if(t.generation!==this.generation||t.auth!==this.authGeneration||t.rpc!==this.rpc)throw Error('STALE_OPERATION');this.ticket(); }
  async checkAuth() {
    const t=this.ticket();
    const account=await t.rpc.call('account/read',{refreshToken:false}).catch(()=>{this.current(t);this.halt();throw Error('AUTH_BOUNDARY_STOPPED');});
    this.current(t);
    // A change detector only: this is NOT proof of stable account/workspace identity.
    if(account.account?.type!=='chatgpt'||JSON.stringify(account.account)!==this.fingerprint){this.halt();throw Error('AUTH_BOUNDARY_STOPPED');}
    return t;
  }
  async checkedCall(method,params) {
    const t=await this.checkAuth();this.current(t);
    if(['turn/start','turn/steer'].includes(method))this.sentPending.add(params.threadId);
    const result=await t.rpc.call(method,params);this.current(t);return result;
  }
  async connect() {
    if(this.busy || this.state.connection==='connected') throw Error('CONNECTION_BUSY');
    this.busy=true; this.halt(); const gen=++this.generation, auth=this.authGeneration;
    const valid=()=>{if(gen!==this.generation||auth!==this.authGeneration)throw Error('CONNECTION_CANCELLED');};
    let initialAuthRevision=0;
    try {
      if(this.stopping)await this.stopping;
      if(this.stopFailure)throw Error('PROCESS_STOP_UNCONFIRMED');
      if(gen!==this.generation)throw Error('CONNECTION_CANCELLED');
      disconnect(this.state); this.state.connection='connecting'; this.changed();
      this.transport=await this.factory(); this.rpc=this.transport.rpc;
      valid();
      this.rpc.on('notification',m=>{ if(gen===this.generation&&auth===this.authGeneration) {
        if(m.method==='account/updated'&&this.state.connection==='connecting'&&this.state.authGate==='blocked'&&m.params?.authMode==='chatgpt'){
          // No operations are enabled yet. Invalidate pending initial observations; never trust the notification as identity.
          ++initialAuthRevision;return;
        }
        if(['account/updated','account/login/completed','modelProvider/authRecoveryStarted','modelProvider/authRecoveryCompleted'].includes(m.method)){this.halt();return;}
        project(this.state,m); this.changed();
      } });
      this.rpc.on('request',m=>{ if(gen===this.generation&&auth===this.authGeneration&&this.state.authGate==='ready') this.approval(m); });
      this.rpc.on('disconnect',()=>{if(gen===this.generation&&auth===this.authGeneration)this.halt('CONNECTION_LOST_RESULTS_UNKNOWN');});
      await this.rpc.call('initialize',{clientInfo:{name:'onecarat_cx',version:'0.1.0'},capabilities:{experimentalApi:false}});
      valid();
      this.rpc.send({method:'initialized',params:{}});
      const config=await this.rpc.call('config/read',{includeLayers:false});
      valid();
      const c=config.config??{};
      this.providerSafe=!c.model_provider || c.model_provider==='openai';
      this.integrationsSafe=!Object.values(c.mcp_servers??{}).some(s=>s.enabled!==false);
      let candidate=null,candidateRevision=-1,stable=false;
      for(let attempt=0;attempt<4;attempt++){
        const revision=initialAuthRevision;
        const account=await this.rpc.call('account/read',{refreshToken:false});valid();
        if(account.account?.type!=='chatgpt')throw Error('CHATGPT_REQUIRED');
        if(revision!==initialAuthRevision)continue;
        const observed=JSON.stringify(account.account);
        if(candidate!==null&&candidate!==observed)throw Error('AUTH_CHANGED_DURING_CONNECT');
        if(candidate===observed&&candidateRevision===revision){stable=true;break;}
        candidate=observed;candidateRevision=revision;
      }
      if(!stable)throw Error('AUTH_INITIALIZATION_UNSTABLE');
      this.state.auth='chatgpt';this.fingerprint=candidate;
      this.state.authGate='ready';this.state.connection='connected'; this.state.error=null;
      // No stable identity proof: previous threads remain quarantined, even after same-account sign-in.
    } catch(e) {
      this.halt(this.safeError(e));if(this.stopping)await this.stopping;throw Error(this.safeError(e));
    } finally { this.busy=false; this.changed(); }
  }
  safeError(e) { return /^[A-Z_]{3,80}$/.test(e?.message??'') ? e.message : 'OPERATION_FAILED'; }
  connected() { if(this.state.connection!=='connected') throw Error('NOT_CONNECTED'); }
  own(id) { if(!key(id)||!this.state.threads[id]) throw Error('UNKNOWN_THREAD');return this.state.threads[id]; }
  async create() {
    const ticket=this.ticket(); if(this.creating) throw Error('CREATE_BUSY');
    if(!this.integrationsSafe) throw Error('MCP_CONFIGURATION_REQUIRES_REVIEW');
    if(!this.providerSafe) throw Error('API_PROVIDER_NOT_ALLOWED');
    this.creating=true;
    try {
      const r=await this.checkedCall('thread/start',{cwd:this.cwd,approvalPolicy:'on-request',sandbox:'read-only'});
      this.current(ticket);
      const id=key(r.thread?.id); if(!id) throw Error('INVALID_THREAD_RESPONSE');
      if(this.quarantined.has(id))throw Error('QUARANTINED_THREAD');
      const t=thread(this.state,id); t.subscribed=true; t.status=r.thread.status?.type??'unknown';
      this.state.selected=id; this.changed(); return id;
    } finally {this.creating=false;}
  }
  async list() {
    const ticket=this.ticket();
    // Never import unrelated sessions from the user's Codex home.
    const r=await this.checkedCall('thread/list',{limit:100,cwd:this.cwd});
    this.current(ticket);
    for(const row of r.data??[]) if(this.state.threads[row.id]) this.state.threads[row.id].saved=true;
    this.changed(); return Object.keys(this.state.threads);
  }
  async read(id) {
    const ticket=this.ticket(), t=this.own(id);
    let r;
    try {r=await this.checkedCall('thread/read',{threadId:id,includeTurns:true});this.current(ticket);t.historyAvailable=true;}
    catch(e) {
      this.current(ticket);
      if(e.message!=='RPC_REJECTED')throw e;
      r=await this.checkedCall('thread/read',{threadId:id,includeTurns:false});this.current(ticket);t.historyAvailable=false;
    }
    if(r.thread?.id!==id) throw Error('THREAD_RESPONSE_MISMATCH');
    t.status=r.thread.status?.type??'unknown';
    for(const turn of r.thread.turns??[]) {
      if(!key(turn.id)) continue;
      for(const item of turn.items??[]) project(this.state,{method:['completed','failed','interrupted'].includes(turn.status)?'item/completed':'item/started',params:{threadId:id,turnId:turn.id,item}});
      if(['completed','failed','interrupted'].includes(turn.status)) project(this.state,{method:'turn/completed',params:{threadId:id,turn}});
      else { t.turns[turn.id]??={id:turn.id,items:{}}; t.turns[turn.id].status='unknown'; }
    }
    this.changed(); return t;
  }
  select(id) {this.ticket();this.own(id);this.state.selected=id;this.changed();}
  async submit(id,prompt,expectedTurn=null) {
    this.ticket(); const ticket=this.ticket(), t=this.own(id);
    if(!this.allowModel) throw Error('MODEL_EXECUTION_NOT_AUTHORIZED');
    if(this.state.auth!=='chatgpt' || !this.providerSafe) throw Error('CHATGPT_REQUIRED');
    if(!this.integrationsSafe) throw Error('MCP_CONFIGURATION_REQUIRES_REVIEW');
    if(!t.subscribed) throw Error('READ_ONLY_AFTER_RECONNECT');
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000) throw Error('INVALID_INPUT');
    if(this.submitting.has(id)||t.deliveryUnknown) throw Error('INPUT_LOCKED_RESULT_UNKNOWN');
    if(expectedTurn!==null && expectedTurn!==t.activeTurn) throw Error('TURN_CHANGED');
    if(expectedTurn===null && (t.activeTurn || !['idle','completed','failed','interrupted'].includes(t.status))) throw Error('THREAD_NOT_IDLE');
    this.submitting.add(id);
    try {
      const params={threadId:id,input:[{type:'text',text:prompt}]};
      if(expectedTurn!==null) params.expectedTurnId=expectedTurn;
      const r=await this.checkedCall(expectedTurn!==null?'turn/steer':'turn/start',params);
      this.current(ticket);
      if(expectedTurn===null) {
        if(!key(r.turn?.id)) throw Error('INVALID_TURN_RESPONSE');
        project(this.state,{method:'turn/started',params:{threadId:id,turn:r.turn}});
      }
    } catch(e) {
      this.current(ticket);
      if(e.message!=='RPC_REJECTED') {t.deliveryUnknown=true;t.status='unknown';}
      t.error=this.safeError(e); throw Error(t.error);
    } finally {this.submitting.delete(id);this.sentPending.delete(id);this.changed();}
  }
  approval(m) {
    const p=m.params??{}, t=this.state.threads[p.threadId];
    if(!t || !key(p.turnId) || !['string','number'].includes(typeof m.id)) {this.state.error='UNSCOPED_SERVER_REQUEST';this.changed();return;}
    const requestKey=JSON.stringify([this.generation,m.id]);
    if(this.requestKeys.has(requestKey)) return;
    const id=`approval-${this.generation}-${this.requestKeys.size+1}`;this.requestKeys.set(requestKey,id);
    const item=t.turns[p.turnId]?.items[p.itemId];
    const command=text(p.command)||item?.command||'';
    const changes=item?.changes??[];
    this.state.approvals[id]={id,requestId:m.id,threadId:p.threadId,turnId:p.turnId,itemId:key(p.itemId),method:m.method,
      status:'pending',supported:supported.has(m.method),command,cwd:text(p.cwd)||item?.cwd||'',reason:text(p.reason),
      changes,grantRoot:text(p.grantRoot),
      // Permission/network grants need a dedicated UI; never flatten them to a command approval.
      completeContext:!p.additionalPermissions&&!p.networkApprovalContext&&(m.method==='item/commandExecution/requestApproval'?!!command:changes.length>0),decisions:p.availableDecisions};
    this.changed();
  }
  async answer(id,decision) {
    this.ticket();const a=this.state.approvals[id];
    if(!a||a.status!=='pending') throw Error('APPROVAL_ALREADY_HANDLED');
    if(!a.supported||!['accept','decline'].includes(decision)) throw Error('UNSUPPORTED_APPROVAL');
    if(decision==='accept'&&!a.completeContext)throw Error('APPROVAL_CONTEXT_INCOMPLETE');
    if(a.decisions && !a.decisions.includes(decision)) throw Error('DECISION_NOT_OFFERED');
    a.status='checking'; // lock before asynchronous authentication check
    try {const ticket=await this.checkAuth();this.current(ticket);if(a.status!=='checking')throw Error('APPROVAL_ALREADY_HANDLED');a.status='sent';a.decision=decision;ticket.rpc.send({id:a.requestId,result:{decision}});} catch(e) {
      if(!['cancelled','answered'].includes(a.status))a.status='unknown';
      throw e;
    } finally {this.changed();}
  }
  async stop() {++this.generation;this.halt();if(this.stopping)await this.stopping;}
}
