using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Web.Script.Serialization;
static class MotionPreview {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static void Sample(Stage11 form,double seconds){
  double now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();string activity=seconds<5?"thinking":seconds<10?"researching":seconds<15?"editing":seconds<20?"running":seconds<26?"delegating":seconds<46?"approval":seconds<53?"running":"finished";
  bool approval=seconds>=26&&seconds<46;double at=approval?now-(seconds-26)*1000:seconds>=53?now-(seconds-53)*1000:now;
  var rows=new List<object>{new{id="demo-manager",parent="",activity=activity,at=at,fresh=true,approval=approval?"pending":"none",assignedAt=0}};
  if(seconds>=20)for(int i=0;i<2;i++)rows.Add(new{id="demo-agent-"+i,parent="demo-manager",activity=seconds<26?"arrived":seconds<46?(i==0?"reading":"editing"):seconds<53?"reported":"finished",at=seconds>=46?now-(seconds-46)*1000:now,fresh=true,approval="none",assignedAt=now-(seconds-20)*1000,ended=seconds>=46});
  form.Receive(Json.Serialize(new{thread="demo-manager",status="watching",actors=rows}));
 }
 [STAThread]static int Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  bool verify=args.Length==2&&args[0]=="--verify";var form=new Stage11("demo-manager",DisplayLanguage.Detect()=="ja",null);form.SyntheticPreview=true;
  var timer=new Timer{Interval=verify?300:200};var watch=Stopwatch.StartNew();int index=0;bool passed=true;double[] phases={1,6,11,16,22,27,44,48,54,62};
  timer.Tick+=delegate{double t=verify?phases[index]:watch.Elapsed.TotalSeconds%65;Sample(form,t);
   if(verify){if(t==27)passed&=form.Banner().Length>0;if(t==44)passed&=form.Banner().Contains(form.Japanese?"不明":"unknown");if(t==48)passed&=form.Banner().Length==0;
    form.CapturePath=Path.Combine(args[1],"phase-"+(int)t+".png");form.SaveCapture();form.CapturePath="";if(++index==phases.Length){timer.Stop();form.Close();}}
  };
  Sample(form,0);form.Shown+=delegate{timer.Start();};Application.Run(form);timer.Dispose();return passed&&form.WorkerStopped?0:1;
 }
}
