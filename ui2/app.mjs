import {MockOffice,statuses,provisionalLimits} from './domain.mjs';
const model=new MockOffice();let view='office',selectedTopic=null,selectedRun=null,bundled=false,showArchived=false;
let editTopicId=null,topicDraft={title:'',question:'',target:''};const deepenDrafts=new Map();
const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const errors={INVALID_INPUT:'入力内容を確認してください。',INVALID_TIME:'日時はタイムゾーン付きISO形式で入力してください（例：2026-12-01T18:00+09:00）。',TOPIC_LIMIT:'仮のテーマ上限に達しました。',RUN_LIMIT:'このテーマの仮の実行回数上限に達しました。',RUN_BUSY:'同じテーマのモックが作業中です。先に完了または取消してください。',RUN_NOT_ACTIVE:'このモックは終了しています。追加イベントは適用しません。',STALE_REVISION:'状態が更新されました。内容を確認してください。'};
function button(label,fn,cls){const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;}
function act(type,payload){try{const result=model.dispatch({type,payload,operationId:crypto.randomUUID(),epoch:model.state.epoch,expectedRevision:model.state.revision});$('#error').hidden=true;return {ok:true,result};}catch(e){$('#error').hidden=false;$('#error').textContent=errors[e.message]??'操作できませんでした（'+e.message+'）。';return {ok:false};}}
function note(text){$('#notice').textContent=text;}
function runButtons(r){const box=el('div',undefined,'actions');if(r.status==='running'){
  box.append(button(r.stage===0?'成果受領イベントを進める':'完了イベントを進める',()=>{act('run.advance',{runId:r.id});render();},'primary'),button('モックを取消',()=>{act('run.cancel',{runId:r.id});render();}));
}box.append(button('Labで成果を見る',()=>{selectedTopic=r.topicId;selectedRun=r.id;view='lab';render();}));return box;}
function heading(kicker,title,copy){const h=el('section',undefined,'heading');h.append(el('p',kicker,'eyebrow'),el('h1',title),el('p',copy,'muted'));return h;}
function figure(status){const n=el('div',undefined,'figure '+status+' '+model.state.appearance.character);n.innerHTML='<svg viewBox="0 0 120 160" aria-hidden="true"><ellipse cx="60" cy="150" rx="32" ry="5" class="shadow"/><g class="person"><circle cx="60" cy="32" r="20" class="head"/><path d="M60 53 L60 103 M60 69 L29 89 M60 69 L91 89 M60 103 L39 143 M60 103 L81 143" class="body"/><circle cx="53" cy="29" r="2"/><circle cx="67" cy="29" r="2"/><path d="M53 39 Q60 45 67 39" class="mouth"/></g></svg>';return n;}
function office(root){
  root.append(heading('LIVE OFFICE · FIXTURE','仕事の動きが、見える場所。','予定と活動を分け、実際に進めたモックイベントだけを表示します。'));
  const s=model.state,r=s.runs.find(x=>x.id===selectedRun)??s.runs.at(-1);
  const scene=el('section',undefined,'scene '+s.appearance.background);scene.append(el('span','ONECARAT OFFICE','scene-label'),el('div','', 'window'),el('div','♧','plant'));
  if(r){const agent=el('div',undefined,'agent');agent.append(figure(r.status),el('strong','モック担当'),el('span',statuses[r.status],'status'));scene.append(agent);}else scene.append(el('p','まだ活動はありません。Research Labでテーマを作成しましょう。','empty'));
  root.append(scene);const cols=el('div',undefined,'columns'),work=el('section',undefined,'panel'),activity=el('section',undefined,'panel');
  work.append(el('h2','作業と成果'),button('Research Labを開く',()=>{view='lab';render();},'primary'));
  if(!s.runs.length)work.append(el('p','テーマを作っただけでは実行しません。開始には明示操作が必要です。','muted'));
  for(const row of [...s.runs].reverse()){const b=button(row.title+' · '+statuses[row.status]+' · '+row.id,()=>{selectedRun=row.id;render();},'job '+(r?.id===row.id?'selected':''));b.setAttribute('aria-pressed',String(r?.id===row.id));work.append(b);}
  activity.append(el('h2',r?'選択した作業':'活動の記録'));
  if(r){activity.append(el('h3',r.title),el('p',r.question),el('p',`成果 ${r.cardIds.length}件 / 状態 ${statuses[r.status]}`),runButtons(r),el('p','完了は内容の正しさを保証しません。担当・成果はすべてfixtureです。','muted'));}
  const events=s.events.filter(e=>!r||e.runId===r.id).slice(-12).reverse();for(const e of events)activity.append(el('p',new Date(e.time).toLocaleTimeString()+' · '+e.kind,'event'));cols.append(work,activity);root.append(cols);
}
function topicForm(root){
  const details=el('details',undefined,'panel');details.open=!model.state.topics.length;details.append(el('summary','＋ テーマを追加 / 選択テーマを編集'));
  const form=el('form');form.innerHTML='<label>テーマ名<input name="title" maxlength="120" required></label><label>調査したいこと<textarea name="question" rows="3" maxlength="20000" required></textarea></label><label>希望完了日時（仮解釈・自動実行なし）<input name="target" placeholder="2026-12-01T18:00+09:00"></label><p class="muted">日時は表示用です。未入力も可能。保存されるのはこのページのメモリだけです。</p><div class="actions"><button type="submit" class="primary">テーマを追加</button><button type="button" id="edit-topic">選択テーマを読み込む</button><button type="button" id="clear-topic">新規入力に戻す</button></div>';
  for(const k of ['title','question','target'])form.elements[k].value=topicDraft[k];
  form.querySelector('[type=submit]').textContent=editTopicId?'テーマを更新':'テーマを追加';
  form.oninput=()=>{topicDraft=Object.fromEntries(new FormData(form));};
  form.querySelector('#edit-topic').onclick=()=>{const t=model.state.topics.find(x=>x.id===selectedTopic);if(!t)return;editTopicId=t.id;for(const k of ['title','question','target'])form.elements[k].value=topicDraft[k]=t[k];form.querySelector('[type=submit]').textContent='テーマを更新';};
  form.querySelector('#clear-topic').onclick=()=>{editTopicId=null;topicDraft={title:'',question:'',target:''};form.reset();for(const k of ['title','question','target'])form.elements[k].value='';form.querySelector('[type=submit]').textContent='テーマを追加';};
  form.onsubmit=e=>{e.preventDefault();const result=act('topic.save',{id:editTopicId,...Object.fromEntries(new FormData(form))});if(result.ok){selectedTopic=result.result;selectedRun=null;editTopicId=null;topicDraft={title:'',question:'',target:''};note('テーマを更新しました。実行は開始していません。');render();}};
  details.append(form);root.append(details);
}
function cardView(c,r){
  const n=el('article',undefined,'card');n.dataset.cardId=c.id;n.append(el('span',c.archived?'アーカイブ':'FIXTURE','eyebrow'),el('h3',c.title),el('p',c.summary,'summary'),el('p','担当：'+c.assignee),el('p','出典：'+(c.sources.map(x=>x.label+'（'+x.url+'）').join(' / ')||'未確認'),'muted'),el('p','不確実性：'+c.uncertainty,'uncertainty'),el('p',c.reviewState==='fixtureReviewed'?'モックレビュー済み（実証ではありません）':'レビュー未実施','muted'));
  if(c.parentCardId)n.append(el('p','元カード：'+c.parentCardId,'muted'));
  if(r.status!=='completed')n.append(el('p','この回は完了確認されていません。部分成果です。','uncertainty'));
  const actions=el('div',undefined,'actions');
  actions.append(button(c.archived?'戻す':'アーカイブ',()=>{act('card.archive',{cardId:c.id});render();}),button('↑',()=>{act('card.move',{cardId:c.id,delta:-1});render();}),button('↓',()=>{act('card.move',{cardId:c.id,delta:1});render();}),button('モックレビュー',()=>{act('card.review',{cardId:c.id});render();}));
  actions.children[1].setAttribute('aria-label',c.title+'を上へ');actions.children[2].setAttribute('aria-label',c.title+'を下へ');n.append(actions);
  const d=el('details');d.append(el('summary','この成果を深掘りする'));const f=el('form');const label=el('label','追加の質問');const input=el('input');input.name='question';input.value=deepenDrafts.get(c.id)??'';input.oninput=()=>deepenDrafts.set(c.id,input.value);input.required=true;input.maxLength=20000;label.append(input);const b=el('button','深掘りモックを開始','primary');b.type='submit';f.append(label,b);f.onsubmit=e=>{e.preventDefault();const out=act('run.start',{topicId:r.topicId,parentCardId:c.id,question:input.value});if(out.ok){deepenDrafts.delete(c.id);selectedRun=out.result;render();}};d.append(f);n.append(d);return n;
}
function lab(root){
  root.append(heading('RESEARCH LAB · FIXTURE','問いを育て、成果を束ねる。','1テーマ・1回につき最大10件。出典・担当・不確実性を失わずに整理します。'));
  topicForm(root);const s=model.state;selectedTopic??=s.topics[0]?.id;
  const t=s.topics.find(x=>x.id===selectedTopic);if(!t){root.append(el('p','まずテーマを追加してください。','empty'));return;}
  const tabs=el('div',undefined,'topics');for(const x of s.topics){const b=button(x.title,()=>{selectedTopic=x.id;selectedRun=null;render();},x.id===t.id?'selected':'');b.setAttribute('aria-pressed',String(x.id===t.id));tabs.append(b);}root.append(tabs);
  const panel=el('section',undefined,'panel');panel.append(el('h2',t.title),el('p',t.question),el('p',t.target?'希望完了（仮）：'+t.target+(Date.parse(t.target)<Date.now()?' · 期限超過（自動実行なし）':' · 自動実行なし'):'希望完了日時：指定なし','muted'));
  const select=el('select');select.id='scenario';select.setAttribute('aria-label','モックシナリオ');for(const [v,label]of Object.entries({normal:'通常 · 3件',empty:'空結果 · 0件',ten:'上限 · 10件',overflow:'不正結果 · 11件',failure:'部分成果＋失敗',unknown:'部分成果＋結果不明'})){const o=el('option',label);o.value=v;select.append(o);}
  const start=button('モック調査を開始',()=>{const out=act('run.start',{topicId:t.id,scenario:select.value});if(out.ok){selectedRun=out.result;note('架空の作業を開始しました。次のイベントはボタンで進めます。');render();}},'primary');start.disabled=s.runs.some(r=>r.topicId===t.id&&r.status==='running');const actions=el('div',undefined,'actions');actions.append(select,start);panel.append(actions);root.append(panel);
  const runs=s.runs.filter(x=>x.topicId===t.id),r=runs.find(x=>x.id===selectedRun)??runs.at(-1);
  if(!r){root.append(el('p','このテーマの成果はまだありません。','empty'));return;}selectedRun=r.id;
  const history=el('select');history.setAttribute('aria-label','実行履歴');for(const x of [...runs].reverse()){const o=el('option',x.id+' · '+statuses[x.status]+(x.parentCardId?' · 深掘り':''));o.value=x.id;o.selected=x.id===r.id;history.append(o);}history.onchange=()=>{selectedRun=history.value;render();};root.append(history);
  const status=el('section',undefined,'panel');status.append(el('h2',statuses[r.status]+' · '+r.cardIds.length+'件'),el('p',r.scenario==='overflow'&&r.status==='invalidResult'?'11件を受領したため採用しませんでした。上限は10件です。':'架空のイベントを手動で進めます。時計による実行はありません。','muted'),runButtons(r));root.append(status);
  const tools=el('div',undefined,'actions');tools.append(button(bundled?'今回のカードだけ表示':'束で表示（深掘りを含む）',()=>{bundled=!bundled;render();}),button(showArchived?'アーカイブを隠す':'アーカイブも表示',()=>{showArchived=!showArchived;render();}));root.append(tools);
  const ordered=bundled?runs.flatMap(x=>x.cardIds):r.cardIds;const cards=ordered.map(id=>s.cards.find(c=>c.id===id)).filter(c=>showArchived||!c.archived);
  if(!cards.length)root.append(el('p',r.stage===0&&r.status==='running'?'成果の受領を待っています。':'表示できる成果は0件です。','empty'));
  if(bundled){const groups=new Map();for(const c of cards){const key=c.bundleId??c.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}for(const [key,members]of groups){const d=el('details',undefined,'bundle');d.open=true;d.append(el('summary','束 '+key+' · '+members.length+'件'));const grid=el('div',undefined,'cards');for(const c of members)grid.append(cardView(c,s.runs.find(x=>x.id===c.runId)));d.append(grid);root.append(d);}}
  else {const grid=el('div',undefined,'cards');for(const c of cards)grid.append(cardView(c,r));root.append(grid);}
  const preview=el('details',undefined,'panel');preview.append(el('summary','今回の保存内容をプレビュー（書き込みなし）'),el('pre',model.preview(r.id)));root.append(preview,el('p','フォルダへの保存・Google Drive・実調査・時刻指定実行は未実装です。','muted'));
}
function settings(root){root.append(heading('APPEARANCE · PROVISIONAL','オフィスの雰囲気を選ぶ。','Q4の交換可能な仮設定です。人物数・活動状態・権限は変わりません。'));
  const panel=el('section',undefined,'panel');for(const [key,title,values]of [['character','人物',{classic:'棒人間',round:'丸い人物'}],['background','背景',{garden:'昼の庭',night:'夜のオフィス'}]]){const label=el('label',title),select=el('select');select.setAttribute('aria-label',title);for(const [v,t]of Object.entries(values)){const o=el('option',t);o.value=v;o.selected=model.state.appearance[key]===v;select.append(o);}select.onchange=()=>{act('appearance',{...model.state.appearance,[key]:select.value});render();};label.append(select);panel.append(label);}panel.append(button('既定に戻す',()=>{act('appearance',{character:'classic',background:'garden'});render();}),el('p',`Q5の仮上限：テーマ${provisionalLimits.topics}件 / テーマごとの回数${provisionalLimits.runsPerTopic}回 / 本文${provisionalLimits.text}文字。永続保存なし。`,'muted'));root.append(panel);}
function render(){const root=$('#content');root.replaceChildren();for(const n of document.querySelectorAll('[data-view]'))n.setAttribute('aria-current',n.dataset.view===view?'page':'false');({office,lab,settings})[view](root);}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;$('#error').hidden=true;note('');render();});render();
