const $=s=>document.querySelector(s);
let state, posting=false, last='', polling, networkError='', actionError='';
const drafts=new Map();
const labels={unknown:'不明',idle:'待機中',active:'作業中',completed:'実行完了',failed:'失敗',interrupted:'中断',notLoaded:'未ロード',systemError:'エラー',observed:'活動を観測'};
const node=(tag,value,cls)=>{const e=document.createElement(tag);if(value)e.textContent=value;if(cls)e.className=cls;return e;};
function error(message){$('#error').textContent=message;$('#error').hidden=!message;}
const errors={MODEL_EXECUTION_NOT_AUTHORIZED:'モデル実行は無効です。実機テストには作者の個別承認が必要です。',READ_ONLY_AFTER_RECONNECT:'購読は復旧していません。安全のためこのセッションは参照のみです。',CHATGPT_REQUIRED:'正規のChatGPTログインを確認できません。',CONNECTION_LOST_RESULTS_UNKNOWN:'接続が切れました。未確定の操作結果は不明です。再送はしません。',AUTH_REQUIRED:'起動時に表示されたURLから開いてください。',MCP_CONFIGURATION_REQUIRES_REVIEW:'外部ツール設定の確認が必要です。新規作業を停止しました。',RPC_REJECTED:'Codexが要求を拒否しました。現在の状態は取得できていません。',RPC_TIMEOUT_RESULT_UNKNOWN:'応答を確認できませんでした。結果は不明です。自動再送しません。',UNSUPPORTED_CODEX_VERSION:'対応するCodex CLIは0.169.0です。',CODEX_EXE_NOT_FOUND:'Codex実行ファイルを見つけられません。起動手順を確認してください。',NORMAL_USER_REQUIRED:'Windowsの通常ユーザー権限で起動してください。',APPROVAL_CONTEXT_INCOMPLETE:'判断材料が不足しているため承認できません。',TURN_CHANGED:'作業状態が変わりました。状態を確認してください。',INVALID_INPUT:'依頼を1〜12,000文字で入力してください。'};
Object.assign(errors,{
  UI_CONNECTION_LOST:'画面の更新を確認できません。操作結果は不明です。CXランタイムの起動状態を確認し、「画面を再確認」を押してください。依頼は自動再送しません。',
  NOT_CONNECTED:'接続されていません。接続ボタンから状態を確認してください。',
  CODEX_EXECUTION_ERROR:'Codexの実行エラーを観測しました。活動と作業状態を確認してください。自動再実行はしません。',
  INPUT_LOCKED_RESULT_UNKNOWN:'送信結果が不明のため、このセッションの入力を停止しています。再送せず、状態を確認してください。',
  THREAD_NOT_IDLE:'作業状態を確認できません。「状態を照合」で確認してください。',
  STATE_LOAD_FAILED:'保存状態を読み込めませんでした。既存セッションは自動復元しません。',
  STATE_SAVE_FAILED:'状態を保存できませんでした。保存先の空き容量と書き込み可否を確認してください。',
  PROCESS_STOP_UNCONFIRMED:'検証用プロセスの終了を確認できません。再接続せず、起動元で状態を確認してください。',
  OPERATION_FAILED:'操作を完了できませんでした。現在の状態を確認してください。自動再送はしません。'
});
async function api(path,body){
  let r,data;
  try {
    r=await fetch('/api/'+path,{signal:AbortSignal.timeout(35000),method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-CX-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
    data=await r.json();
  } catch {throw Error('UI_CONNECTION_LOST');}
  if(!r.ok)throw Error(typeof data.error==='string'&&/^[A-Z_]{3,80}$/.test(data.error)?data.error:'OPERATION_FAILED');
  return data;
}
function repaint(){if(state)render(state);else {error(errors[networkError]??networkError);document.querySelectorAll('button,textarea').forEach(e=>e.disabled=true);$('#retry-state').hidden=false;$('#retry-state').disabled=false;}}
async function action(path,body={}){
  body={...body,boundary:state?.boundary};if(posting||networkError)return false;
  posting=true;actionError='';repaint();
  try{await api(path,body);await update();return true;}
  catch(e){actionError=e.message;if(e.message==='UI_CONNECTION_LOST')networkError=e.message;return false;}
  finally{posting=false;repaint();}
}
errors.AUTH_BOUNDARY_STOPPED='認証の安全確認で停止しました。旧セッションは隔離され、自動再開しません。再接続後は新規セッションを作成してください。';
errors.STALE_OPERATION='認証または接続が変わりました。操作は再送しません。';
function figure(status){
  const container=node('div',null,'figure '+status);
  // Original CX SVG; all variable content is assigned with textContent, never HTML.
  container.innerHTML='<svg viewBox="0 0 120 150" aria-hidden="true"><ellipse class="shadow" cx="60" cy="141" rx="32" ry="5"/><g class="person"><circle class="head" cx="60" cy="30" r="19"/><path class="body" d="M60 50 L60 100 M60 65 L34 84 M60 65 L86 84 M60 100 L42 136 M60 100 L78 136"/><circle cx="54" cy="27" r="2"/><circle cx="67" cy="27" r="2"/><path class="mouth" d="M54 36 Q60 42 67 36"/></g></svg>';
  return container;
}
let displayedBoundary, displayedThread;
function render(s){
  const focused=document.activeElement?.dataset.focusKey;
  if(displayedBoundary!==s.boundary){drafts.clear();$('#prompt').value='';displayedBoundary=s.boundary;displayedThread=s.selected;actionError='';}
  else if(displayedThread!==s.selected){
    if(displayedThread)drafts.set(displayedThread,$('#prompt').value);
    $('#prompt').value=drafts.get(s.selected)??'';displayedThread=s.selected;actionError='';
  }
  const blocked=s.authGate!=='ready'||s.auth!=='chatgpt';
  $('#prompt').disabled=blocked;
  const t=s.threads[s.selected];
  $('#connection').textContent=({connected:'● 接続中',connecting:'◌ 接続しています',disconnected:'○ 未接続'})[s.connection]+' · '+(s.mode==='demo'?'モック':s.auth==='chatgpt'?'ChatGPT':s.auth==='notChatGPT'?'未ログイン':'認証未確認');
  $('#mode').textContent=blocked?'認証境界：停止中（実行済み操作の取消完了を意味しません）':s.mode==='demo'?'MOCK · 実作業ではありません':s.allowModel?'LIVE · 実行可能':'LIVE · モデル送信無効';
  $('#connect').disabled=s.connection!=='disconnected';$('#disconnect').disabled=s.connection==='disconnected';
  $('#new').disabled=(s.connection!=='connected'||blocked);$('#refresh').disabled=(s.connection!=='connected'||blocked);$('#read').disabled=!t||(s.connection!=='connected'||blocked);
  const sessions=$('#sessions');sessions.replaceChildren();
  for(const th of Object.values(s.threads)){const b=node('button',th.id.slice(0,24)+'\n'+(labels[th.status]??'不明'),th.id===s.selected?'session selected':'session');b.title=th.id;b.dataset.focusKey='session:'+th.id;b.setAttribute('aria-current',th.id===s.selected?'true':'false');b.onclick=()=>action('thread/select',{threadId:th.id});sessions.append(b);}
  if(!sessions.children.length)sessions.append(node('p',blocked?'接続すると新しいセッションを開始できます。':'この接続のセッションはまだありません。','muted'));
  $('#title').textContent=t?'仕事を見守る、Office。':'今日の仕事を、ここから。';
  const agents=$('#agents');agents.replaceChildren();
  if(t){
    const members=[{id:t.id,status:t.status,main:true},...Object.values(t.agents)];
    for(const a of members){const card=node('div',null,'agent');card.append(figure(a.status),node('strong',a.main?'メインエージェント':'サブエージェント'),node('span',labels[a.status]??'不明','agent-state'));if(!a.main)card.append(node('small',a.id));agents.append(card);}
  }else agents.append(node('p','新しいセッションから始めましょう。','empty'));
  const latestTurn=Object.values(t?.turns??{}).at(-1);
  $('#session-note').textContent=t?(t.subscribed?'この接続で作成したセッションを観測中。実行完了は成果の正しさを保証しません。':'参照のみ：購読は未復旧です。意図しない実行を防ぐため、自動再開しません。'):'まだエージェントは観測されていません。';
  if(latestTurn&&['completed','failed','interrupted'].includes(latestTurn.status))$('#session-note').textContent+=' 直近のTurn：'+labels[latestTurn.status]+'。';
  const messages=$('#messages'),scrollTop=messages.scrollTop,followBottom=messages.scrollHeight-messages.clientHeight-scrollTop<24;
  messages.replaceChildren();
  for(const turn of Object.values(t?.turns??{}))for(const item of Object.values(turn.items))if(['agentMessage','userMessage'].includes(item.type)&&item.text)messages.append(node('p',(item.type==='userMessage'?'あなた：\n':'')+item.text,'answer'));
  messages.scrollTop=followBottom?messages.scrollHeight:scrollTop;
  const approvals=$('#approvals');approvals.replaceChildren();
  for(const a of Object.values(s.approvals).filter(a=>a.threadId===s.selected)){
    const card=node('article',null,'approval');card.append(node('strong',a.supported?'操作の承認':'未対応の確認要求'),node('pre',[a.command,a.cwd,a.reason,a.grantRoot?'権限対象: '+a.grantRoot:'',...a.changes.map(c=>c.path+'\n'+c.diff)].filter(Boolean).join('\n')),node('small',({pending:'判断待ち',sent:'回答送信済み・確定待ち',answered:'回答済み',cancelled:'取消済み',unknown:'結果不明'})[a.status]??'不明'));
    if(!a.completeContext)card.append(node('p','判断材料が不足しています。承認できません。','muted'));
    if(a.status==='pending'&&a.supported)for(const [decision,title]of [['decline','拒否'],['accept','今回のみ承認']]){const b=node('button',title);b.dataset.focusKey=a.id+':'+decision;b.disabled=(s.connection!=='connected'||blocked)||(decision==='accept'&&!a.completeContext);b.onclick=()=>action('approval',{id:a.id,decision});card.append(b);}
    approvals.append(card);
  }
  if(!approvals.children.length)approvals.append(node('p','承認待ちはありません。','muted'));
  $('#events').replaceChildren(...s.events.filter(e=>e.threadId===s.selected).slice(-16).reverse().map(e=>node('li',new Date(e.time).toLocaleTimeString()+' '+e.method)));
  $('#send').disabled=!t||!t.subscribed||!s.allowModel||(s.connection!=='connected'||blocked)||!!t.deliveryUnknown||(!t.activeTurn&&!['idle','completed','failed','interrupted'].includes(t.status));
  $('#send').textContent=t?.activeTurn?'追加指示を送る ↗':'依頼を送る ↗';
  $('#input-note').textContent=blocked?`自動再送なし。未送信取消 ${s.safety?.unsentCancelled??0}件／送信結果不明 ${s.safety?.pendingUnknown??0}件／実行中だったTurn ${s.safety?.activeUnknown??0}件`:s.mode==='demo'?'架空データによる操作確認':!s.allowModel?'モデル送信は無効':'実行先：CX専用の作業フォルダ';
  const code=networkError||s.error||t?.error||actionError;
  error(code?(errors[code]??`操作を停止しました（${code}）。現在の状態を確認してください。`):'');
  $('#prompt').readOnly=posting;
  $('#composer').setAttribute('aria-busy',String(posting));
  $('#retry-state').hidden=!networkError;
  if(networkError){$('#connection').textContent='○ 画面更新が途絶えています · 接続状態不明';$('#mode').textContent='表示は最終確認時点の情報です';}
  if(posting||networkError)document.querySelectorAll('button').forEach(b=>b.disabled=true);
  if(networkError){$('#prompt').disabled=true;$('#retry-state').disabled=posting;}
  if(posting)$('#input-note').textContent='操作の応答を確認中です。追加操作は送信しません。';
  if(focused)Array.from(document.querySelectorAll('[data-focus-key]')).find(e=>e.dataset.focusKey===focused&&!e.disabled)?.focus({preventScroll:true});
}
async function update(){
  if(polling)return polling;
  polling=(async()=>{try{
    const s=await api('state');if(state&&s.revision<state.revision)return;
    const recovered=!!networkError;networkError='';state=s;const encoded=JSON.stringify(s);
    if(encoded!==last||recovered){last=encoded;render(s);}
  }catch(e){networkError=e.message;repaint();}})();
  try{await polling;}finally{polling=null;}
}
$('#connect').onclick=()=>action('connect');$('#disconnect').onclick=()=>action('disconnect');$('#new').onclick=()=>action('thread/new');$('#refresh').onclick=()=>action('thread/list');$('#read').onclick=()=>action('thread/read',{threadId:state?.selected});
$('#retry-state').onclick=()=>update();
$('#composer').onsubmit=async e=>{e.preventDefault();const t=state?.threads[state.selected];if(!t||$('#send').disabled)return;const value=$('#prompt').value,boundary=state.boundary;
  if(!value.trim()||value.length>12000){actionError='INVALID_INPUT';repaint();return;}
  if(await action('turn',{threadId:t.id,text:value,expectedTurn:t.activeTurn??null})){
    if(state.boundary===boundary){drafts.delete(t.id);if(state.selected===t.id&&$('#prompt').value===value)$('#prompt').value='';}
  }
};
const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
if(token){try{await api('session',{token});}catch(e){networkError=e.message;repaint();}}
await update();setInterval(update,700);
