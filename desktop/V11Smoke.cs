using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Windows.Forms;
using System.Web.Script.Serialization;
static class Smoke11 {
 [STAThread]static int Main(string[] args){
  var checks=new Dictionary<string,bool>();string id=args[0],dest=args[1],requested=args[2];int duration=int.Parse(args[3]);
  checks["ja"]=DisplayLanguage.Select("ja")=="ja"&&DisplayLanguage.Select("ja-JP")=="ja";
  checks["en"]=DisplayLanguage.Select("en-US")=="en";checks["other"]=DisplayLanguage.Select("de-DE")=="en";checks["missing"]=DisplayLanguage.Select(null)=="en";
  CultureInfo.CurrentCulture=new CultureInfo("ar-SA");checks["notRegional"]=DisplayLanguage.Select("ja-JP")=="ja";
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  using(var lease=new WindowLease()){
   if(!lease.Acquire(id))return 10;
   var form=new Stage11(id,DisplayLanguage.Select(requested)=="ja",lease);form.CapturePath=dest;form.CaptureSeconds=duration;
   var json=new JavaScriptSerializer();form.Receive(json.Serialize(new {thread="different-thread",status="watching",actors=new object[0]}));checks["rejectOtherSnapshot"]=form.ObserverStatus=="unavailable"&&form.Actors.Count==0;
   form.Receive(json.Serialize(new {thread=id,status="watching",actors=new[]{new {id=id,parent="",activity="working",at=0,fresh=false},new {id="foreign",parent="another-parent",activity="editing",at=0,fresh=true}}}));checks["rejectOtherActor"]=form.Actors.Count==1&&form.Actors[0].Id==id;
   form.Receive(json.Serialize(new {thread=id,status="watching",actors=new[]{new {id=id,parent="",activity="working",approval="pending",at=0,fresh=false}}}));form.Receive(json.Serialize(new {thread=id,status="missing",actors=new object[0]}));checks["retainApprovalOnMissing"]=form.Actors.Count==1&&form.Banner().Length>0;
   double now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();var manager=new Actor11{Id=id,Activity="working",At=now,Fresh=true};var oldChild=new Actor11{Id="old",Activity="finished",At=now-100000};var newChild=new Actor11{Id="new",Activity="working",At=now,Fresh=true,AssignedAt=now};
   form.Receive(json.Serialize(new {thread=id,status="watching",actors=new object[0]}));form.Actors.AddRange(new[]{oldChild,newChild,manager});var order=form.DisplayOrder();checks["managerFirstActiveChildNext"]=order[0]==manager&&order[1]==newChild;checks["explicitAssignment"]=form.AssignmentActive(newChild)&&!form.AssignmentActive(oldChild);newChild.AssignedAt=now-20000;checks["oldAssignmentNotReplayed"]=!form.AssignmentActive(newChild);newChild.AssignedAt=now;newChild.Ended=true;checks["completedNotDelegating"]=!form.AssignmentActive(newChild);form.Actors.Clear();
   form.Actors.AddRange(new[]{manager,oldChild,newChild});checks["finishedChildFoldedNotManager"]=form.Folded(oldChild)&&!form.Folded(manager);oldChild.Approval="uncertain";checks["approvalNeverFolded"]=!form.Folded(oldChild);oldChild.Approval="none";oldChild.Activity="unknown";checks["silenceDoesNotFold"]=!form.Folded(oldChild);oldChild.Activity="working";oldChild.At=now;oldChild.Fresh=true;checks["resumedChildVisible"]=form.VisibleTeam().Contains(oldChild);oldChild.Activity="finished";checks["recentFinishRemainsForGesture"]=!form.Folded(oldChild);oldChild.At=now-20000;checks["summaryCountsEndedTurns"]=form.TeamSummary().Contains("1");form.Actors.Clear();
   form.Receive(json.Serialize(new{thread=id,status="constructor",actors=new[]{new{id=id,parent="",activity="__proto__",approval="toString",at=now,fresh=true}}}));checks["rejectUnknownEnums"]=form.ObserverStatus=="unavailable"&&form.Actors[0].Activity=="unknown"&&form.Actors[0].Approval=="uncertain";form.Actors.Clear();
   var timer=new Timer();int step=0;timer.Interval=1000;timer.Tick+=delegate{
    if(++step==2){checks["noToolbar"]=form.Controls.Count==0;form.WindowState=FormWindowState.Minimized;checks["minimize"]=form.WindowState==FormWindowState.Minimized;}
    if(step==3){form.WindowState=FormWindowState.Normal;var size=form.Size;form.Size=new System.Drawing.Size(100,100);checks["minimum"]=form.Width>=form.MinimumSize.Width;form.Size=size;}
   };form.Shown+=delegate{timer.Start();};Application.Run(form);timer.Dispose();checks["workerExited"]=form.WorkerStopped;checks["windowClosed"]=form.IsDisposed;checks["received"]=form.Samples>1;
  }
  File.WriteAllText(Path.ChangeExtension(dest,"checks.json"),new JavaScriptSerializer().Serialize(checks));foreach(bool ok in checks.Values)if(!ok)return 1;return 0;
 }
}
