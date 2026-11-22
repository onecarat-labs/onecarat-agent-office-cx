using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Web.Script.Serialization;
static class VisualReview {
 [STAThread]static int Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  string mode=args[0],path=args[1],id="88888888-8888-8888-8888-888888888888";bool live=mode=="live";if(live)id=Environment.GetEnvironmentVariable("CODEX_THREAD_ID");
  var form=new Stage11(id,mode!="english",null);form.SyntheticPreview=!live;form.CapturePath=path;form.CaptureSeconds=live?4:2;
  if(mode=="small")form.ClientSize=new Size(360,260);
  if(mode=="large")form.ClientSize=new Size(900,600);
  double now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();var rows=new List<object>();
  rows.Add(new{id=id,parent="",activity=mode=="done"?"finished":"delegating",at=mode=="done"?now-8000:now,fresh=true,approval="none",assignedAt=0});
  for(int i=0;i<6;i++){bool old=i>=2||mode=="done";rows.Add(new{id="child-"+i,parent=id,activity=old?"finished":i==0?"thinking":"editing",at=old?now-60000:now,fresh=!old,approval=mode=="approval"&&i==5?"uncertain":"none",assignedAt=old?0:now});}
  if(mode=="overflow")for(int i=6;i<9;i++)rows.Add(new{id="child-"+i,parent=id,activity="working",at=now,fresh=true,approval="none",assignedAt=0});
  if(!live)form.Receive(new JavaScriptSerializer().Serialize(new{thread=id,status="watching",actors=rows}));
  Application.Run(form);if(!form.WorkerStopped)return 1;return 0;
 }
}
