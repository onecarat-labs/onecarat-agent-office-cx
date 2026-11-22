// Protocol projection: no completion inferred from silence or Item completion.
export const text = value => typeof value === 'string' ? value.slice(0, 100000) : '';
export const key = value => typeof value === 'string' && /^[\w.:-]{1,200}$/.test(value) && !['__proto__','prototype','constructor','toString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toLocaleString','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__'].includes(value) ? value : null;
const terminal = new Set(['completed', 'failed', 'interrupted']);
const itemTypes = new Set(['userMessage','agentMessage','reasoning','plan','commandExecution','fileChange','mcpToolCall','webSearch','collabAgentToolCall','contextCompaction','imageGeneration']);
export function blankState() { return { connection:'disconnected', auth:'unknown', mode:'live', selected:null, threads:{}, approvals:{}, events:[], error:null }; }
export function thread(state, id) {
  if (!key(id)) return null;
  return state.threads[id] ??= { id, status:'unknown', subscribed:false, turns:{}, agents:{}, error:null };
}
export function project(state, m) {
  const p = m.params ?? {}, id = key(p.threadId ?? p.thread?.id);
  // Never fabricate a session from a random notification.
  if (!id || !state.threads[id]) return false;
  const t = state.threads[id], method = m.method;
  const turnId = key(p.turnId ?? p.turn?.id), itemId = key(p.itemId ?? p.item?.id);
  if (method === 'thread/status/changed') {
    const s = p.status?.type;
    if (['idle','active','notLoaded','systemError'].includes(s)) t.status = s;
  } else if (method === 'turn/started' || method === 'turn/completed') {
    if (!turnId) return false;
    const turn = t.turns[turnId] ??= { id:turnId, status:'unknown', items:{} };
    if (method === 'turn/completed') {
      // Already observed terminal evidence is immutable; replay must not replace
      // the outcome of a newer Turn when activeTurn has returned to null.
      if (terminal.has(turn.status)) return false;
      turn.status = terminal.has(p.turn?.status) ? p.turn.status : 'unknown';
      if (!t.activeTurn || t.activeTurn === turnId) { t.activeTurn = null; t.status = turn.status; }
    } else if (!terminal.has(turn.status)) {
      turn.status = 'inProgress'; t.activeTurn = turnId; t.status = 'active';
    }
  } else if (['item/started','item/completed','item/agentMessage/delta'].includes(method)) {
    if (!turnId || !itemId) return false;
    const turn = t.turns[turnId] ??= { id:turnId, status:'unknown', items:{} };
    const item = turn.items[itemId] ??= { id:itemId, type:'unknown', status:'unknown', text:'' };
    if (method.endsWith('/delta')) {
      // Deltas have no stable sequence ID: final Item text is authoritative.
      if (item.status !== 'completed') { item.type='agentMessage'; item.text = (item.text + text(p.delta)).slice(0,100000); }
    } else {
      if (item.status === 'completed' && method === 'item/started') return false;
      item.type = itemTypes.has(p.item?.type) ? p.item.type : 'unknown';
      item.status = method === 'item/completed' ? 'completed' : 'started';
      if (item.type === 'agentMessage') item.text = text(p.item?.text);
      if (item.type === 'userMessage') item.text = (p.item?.content??[]).filter(x=>x.type==='text').map(x=>text(x.text)).join('\n');
      if (item.type === 'commandExecution') { item.command=text(p.item.command);item.cwd=text(p.item.cwd); }
      if (item.type === 'fileChange') item.changes=(Array.isArray(p.item.changes)?p.item.changes:[]).slice(0,100).map(c=>({path:text(c.path),diff:text(c.diff)}));
      if (item.type === 'collabAgentToolCall') {
        for (const childId of p.item?.receiverThreadIds ?? []) if (key(childId)) {
          t.agents[childId] = { id:childId, status:'observed', sourceItem:itemId };
        }
      }
    }
  } else if (method === 'serverRequest/resolved') {
    for (const a of Object.values(state.approvals)) if (a.threadId === id && a.requestId === p.requestId && ['pending','checking','sent'].includes(a.status)) a.status = a.status === 'sent' ? 'answered' : 'cancelled';
  } else if (method === 'error') { t.error = 'CODEX_EXECUTION_ERROR'; }
  else return false;
  // Journal only event metadata, never parameters, commands, prompts or answers.
  const event = { method, threadId:id, turnId, itemId, time:new Date().toISOString() };
  const last = state.events.at(-1);
  if (!last || ['method','threadId','turnId','itemId'].some(k => last[k] !== event[k])) state.events.push(event);
  state.events = state.events.slice(-200);
  return true;
}
export function disconnect(state) {
  state.connection = 'disconnected'; state.auth = 'unknown';
  for (const t of Object.values(state.threads)) { t.subscribed = false; t.status = 'unknown'; t.activeTurn = null; }
  for (const a of Object.values(state.approvals)) if (['pending','sent'].includes(a.status)) a.status='unknown';
}
export function durable(state) {
  return { schema:1, selected:state.selected, threads:Object.values(state.threads).map(t=>({ id:t.id })), events:state.events };
}
