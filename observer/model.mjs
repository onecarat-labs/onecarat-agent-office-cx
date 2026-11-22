// Pure, allowlisted projection. Never retain prompts, tool arguments or outputs.
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : '';
const activities = {CommandExecution:'running',FileChange:'editing',Reasoning:'thinking',WebSearch:'researching',ImageView:'reading',AgentMessage:'reporting',ContextCompaction:'working'};
const tools = {shell:'running',shell_command:'running',exec_command:'running',apply_patch:'editing',read_file:'reading',list_dir:'reading',web_search:'researching',spawn_agent:'delegating',wait:'waiting',wait_agent:'waiting'};
const lookup=(table,key)=>typeof key==='string'&&Object.hasOwn(table,key)?table[key]:undefined;
const toolActivity = name => lookup(tools,name)||'tool';
export function createSession(fallback) { return {id:id(fallback),parent:'',activity:'unknown',at:0,turn:'',terminal:false,version:'',events:0}; }
export function project(s,r) {
  if (!r || typeof r!=='object' || !r.payload || typeof r.payload!=='object') return;
  const p=r.payload, at=Date.parse(r.timestamp);
  if(r.type==='session_meta') {
    s.id=id(p.id)||id(p.session_id)||s.id;
    s.parent=id(p.source?.subagent?.thread_spawn?.parent_thread_id);
    s.version=typeof p.cli_version==='string' && /^[\d.]{1,20}$/.test(p.cli_version)?p.cli_version:'';
    return;
  }
  if(!Number.isFinite(at) || at < s.at) return;
  if(id(p.thread_id)&&s.id&&id(p.thread_id)!==s.id)return;
  let activity;
  if(r.type==='event_msg') {
    if(p.type==='task_started') {const turn=id(p.turn_id);if(s.terminal&&turn&&turn===s.turn)return;s.turn=turn;s.terminal=false;activity='working';}
    else if(p.type==='task_complete'||p.type==='turn_aborted') {
      if(s.turn && id(p.turn_id)!==s.turn)return;
      s.terminal=true;activity=p.type==='task_complete'?'finished':'interrupted';
    } else if(!s.terminal) {
      if(p.turn_id && s.turn && id(p.turn_id)!==s.turn)return;
      if(p.type==='item_completed') activity=lookup(activities,p.item?.type);
      // Explicit protocol events only; absence of activity is NEVER approval evidence.
      if(p.type==='exec_approval_request'||p.type==='apply_patch_approval_request')activity='approval';
      if(p.type==='exec_command_begin')activity='running';
      if(p.type==='patch_apply_begin')activity='editing';
    }
  } else if(r.type==='response_item'&&!s.terminal) {
    if(p.type==='reasoning')activity='thinking';
    if(p.type==='function_call'||p.type==='custom_tool_call')activity=toolActivity(p.name);
    if(p.type==='function_call_output'||p.type==='custom_tool_call_output')activity='working';
    if(p.type==='message'&&p.role==='assistant')activity='reporting';
  }
  if(activity){s.activity=activity;s.at=at;s.events++;}
}
export function publicSession(s,now) {
  return {id:s.id,parent:s.parent,activity:s.activity,at:s.at,fresh:s.at>0&&now-s.at<15000&&now>=s.at-2000,version:s.version,events:s.events};
}
