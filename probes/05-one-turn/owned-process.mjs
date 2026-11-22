// Metadata only. Never discovers, opens, or stops a process by PID.
export function ownedProcessRow(label,pid,ownerPid,runDirectory){
 return {label,pid:pid??null,parentPid:ownerPid,ownerPid,runDirectory,startedAt:new Date().toISOString(),ownedByProbe:true,closed:false};
}
