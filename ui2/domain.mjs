// Phase 2 fixtures only: no transport, storage, timers, Codex or service adapter.
export const provisionalLimits=Object.freeze({topics:20,runsPerTopic:50,text:20000});
export const statuses={ready:'準備完了',running:'作業中',completed:'実行完了',failed:'失敗',unknown:'結果不明',cancelled:'取消済み',invalidResult:'成果形式エラー'};
const fail=code=>{throw Error(code);};
const terminal=new Set(['completed','failed','unknown','cancelled','invalidResult']);
export class MockOffice {
  constructor({limits=provisionalLimits}={}) {
    this.limits={...limits};this.operations=new Map();
    this.state={schemaVersion:1,mode:'mock',epoch:crypto.randomUUID(),revision:0,next:0,topics:[],runs:[],cards:[],events:[],appearance:{character:'classic',background:'garden'}};
  }
  snapshot(){return structuredClone(this.state);}
  dispatch(request){
    if(!request||typeof request!=='object')fail('INVALID_INPUT');
    const {operationId,epoch,expectedRevision,type,payload={}}=request;
    if(epoch!==this.state.epoch)fail('STALE_CONTEXT');
    if(typeof operationId!=='string'||operationId.length>100||!operationId)fail('INVALID_INPUT');
    const signature=JSON.stringify({type,payload});
    const seen=this.operations.get(operationId);
    if(seen){if(seen.signature!==signature)fail('OPERATION_CONFLICT');return structuredClone(seen.result);}
    if(expectedRevision!==this.state.revision)fail('STALE_REVISION');
    if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('INVALID_INPUT');
    // Commit all changes together, never expose a partially applied operation.
    const s=this.snapshot(),id=prefix=>`${prefix}-${++s.next}`;
    const text=(v,max=this.limits.text)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('INVALID_INPUT');
    const topic=tid=>s.topics.find(t=>t.id===tid)??fail('UNKNOWN_TOPIC');
    const run=rid=>s.runs.find(r=>r.id===rid)??fail('UNKNOWN_RUN');
    const card=cid=>s.cards.find(c=>c.id===cid)??fail('UNKNOWN_CARD');
    const event=(r,kind)=>s.events.push({id:id('event'),runId:r?.id??null,topicId:r?.topicId??null,kind,mode:'mock',time:new Date().toISOString()});
    let result;
    switch(type){
      case 'topic.save': {
        const title=text(payload.title,120),question=text(payload.question);
        const target=payload.target??'';
        // A display-only target. Explicit offset required; never schedule anything.
        if(typeof target!=='string')fail('INVALID_TIME');
        if(target){
          if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(target)||!Number.isFinite(Date.parse(target)))fail('INVALID_TIME');
          const [year,month,day]=target.slice(0,10).split('-').map(Number);
          const wall=new Date(target.slice(0,10)+'T00:00:00Z');
          if(wall.getUTCFullYear()!==year||wall.getUTCMonth()+1!==month||wall.getUTCDate()!==day||Number(target.slice(11,13))>23)fail('INVALID_TIME');
        }
        if(payload.id){const t=topic(payload.id);Object.assign(t,{title,question,target,revision:t.revision+1});result=t.id;}
        else {if(s.topics.length>=this.limits.topics)fail('TOPIC_LIMIT');const t={id:id('topic'),title,question,target,revision:1};s.topics.push(t);result=t.id;}
        break;
      }
      case 'run.start': {
        const t=topic(payload.topicId);
        if(s.runs.filter(r=>r.topicId===t.id).length>=this.limits.runsPerTopic)fail('RUN_LIMIT');
        if(s.runs.some(r=>r.topicId===t.id&&r.status==='running'))fail('RUN_BUSY');
        const scenario=payload.scenario??'normal';if(!['normal','empty','ten','overflow','failure','unknown'].includes(scenario))fail('INVALID_INPUT');
        const parent=payload.parentCardId?card(payload.parentCardId):null;
        if(parent&&run(parent.runId).topicId!==t.id)fail('OTHER_TOPIC');
        const question=parent?text(payload.question):t.question;
        const r={id:id('run'),topicId:t.id,topicRevision:t.revision,title:t.title,question,target:t.target,scenario,status:'running',stage:0,cardIds:[],parentCardId:parent?.id??null,attemptId:id('attempt'),lastSequence:0};
        s.runs.push(r);event(r,'run/started');result=r.id;break;
      }
      case 'run.advance': {
        const r=run(payload.runId);if(r.status!=='running')fail('RUN_NOT_ACTIVE');
        if(r.stage===0){
          const count=r.scenario==='empty'?0:r.scenario==='ten'?10:r.scenario==='overflow'?11:3;
          if(count>10){r.status='invalidResult';r.rejectedCount=count;event(r,'result/rejected');break;}
          for(let i=0;i<count;i++){
            const c={id:id('card'),runId:r.id,title:`${r.parentCardId?'深掘り':'調査'} ${i+1} · ${r.title}`,summary:`［架空の成果］${r.question}\n観点${i+1}のサンプルです。実際の調査・事実確認は行っていません。`,sources:i===2?[]:[{label:'同梱fixture資料',url:'https://example.invalid/fixture',verification:'fixture'}],assignee:'モック担当',uncertainty:i===2?'出典未確認':'架空データ・実証なし',reviewState:'unreviewed',parentCardId:r.parentCardId,bundleId:r.parentCardId?(card(r.parentCardId).bundleId??r.parentCardId):null,archived:false};
            s.cards.push(c);r.cardIds.push(c.id);
          }
          r.stage=1;event(r,'cards/received');
        }else {r.status=r.scenario==='failure'?'failed':r.scenario==='unknown'?'unknown':'completed';r.stage=2;event(r,'run/'+r.status);}
        r.lastSequence++;result=r.id;break;
      }
      case 'run.cancel': {const r=run(payload.runId);if(terminal.has(r.status))fail('RUN_NOT_ACTIVE');r.status='cancelled';event(r,'run/cancelled');break;}
      case 'card.review': {const c=card(payload.cardId);c.reviewState='fixtureReviewed';event(run(c.runId),'card/fixture-reviewed');break;}
      case 'card.archive': {const c=card(payload.cardId);c.archived=!c.archived;break;}
      case 'card.move': {
        const c=card(payload.cardId),r=run(c.runId),at=r.cardIds.indexOf(c.id),delta=payload.delta;
        if(![-1,1].includes(delta))fail('INVALID_INPUT');const next=at+delta;
        if(next>=0&&next<r.cardIds.length)[r.cardIds[at],r.cardIds[next]]=[r.cardIds[next],r.cardIds[at]];
        break;
      }
      case 'appearance': {
        if(!['classic','round'].includes(payload.character)||!['garden','night'].includes(payload.background))fail('INVALID_INPUT');
        s.appearance={character:payload.character,background:payload.background};break;
      }
      default:fail('UNSUPPORTED_OPERATION');
    }
    s.events=s.events.slice(-200);s.revision++;this.state=s;
    // Bounded process-memory receipts. Old IDs are still protected by revision checks.
    this.operations.set(operationId,{signature,result});if(this.operations.size>2000)this.operations.delete(this.operations.keys().next().value);
    return structuredClone(result);
  }
  preview(runId){
    const r=this.state.runs.find(r=>r.id===runId)??fail('UNKNOWN_RUN');
    return ['MOCK / 外部送信なし / 未保存',r.title,statuses[r.status],...r.cardIds.map(id=>{const c=this.state.cards.find(c=>c.id===id);return `${c.title}\n${c.summary}\n担当: ${c.assignee}\n不確実性: ${c.uncertainty}\n出典: ${c.sources.map(x=>x.label).join(', ')||'未確認'}`;})].join('\n\n');
  }
}
