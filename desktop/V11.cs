using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class DisplayLanguage {
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern bool GetUserPreferredUILanguages(uint flags,out uint count,IntPtr buffer,ref uint length);
    public static string Select(string first){return first!=null&&(first.Equals("ja",StringComparison.OrdinalIgnoreCase)||first.StartsWith("ja-",StringComparison.OrdinalIgnoreCase))?"ja":"en";}
    public static string Detect(){try{uint count,length=0;if(!GetUserPreferredUILanguages(8,out count,IntPtr.Zero,ref length)||length==0||length>32768)return "en";IntPtr b=Marshal.AllocHGlobal((int)length*2);try{if(!GetUserPreferredUILanguages(8,out count,b,ref length)||count==0)return "en";return Select(Marshal.PtrToStringUni(b));}finally{Marshal.FreeHGlobal(b);}}catch{return "en";}}
}
static class Words11 {
    public static string T(bool ja,string j,string e){return ja?j:e;}
    public static string Activity(bool ja,string a){switch(a){case "thinking":return T(ja,"思考","Thinking");case "reading":return T(ja,"資料を確認","Reading");case "researching":return T(ja,"調査","Research");case "editing":return T(ja,"編集","Editing");case "running":return T(ja,"コマンド実行","Running");case "reporting":return T(ja,"応答","Responding");case "reported":return T(ja,"報告を受領","Report received");case "arrived":return T(ja,"参加","Arriving");case "finished":return T(ja,"ターン終了","Turn ended");case "session-ended":return T(ja,"セッション終了","Session ended");case "interrupted":return T(ja,"中断","Interrupted");case "approval":return T(ja,"承認待ち","Needs approval");case "waiting":return T(ja,"待機の記録","Wait observed");case "delegating":return T(ja,"委任","Delegating");case "working":return T(ja,"作業","Working");case "tool":return T(ja,"ツール","Using a tool");default:return T(ja,"状態不明","Unknown");}}
    public static string Error(bool ja){return T(ja,"この窓はCodexのセッションから起動してください。\nCodexに「Onecarat Agent Office CXを起動して」と依頼するか、セッションIDを指定した起動手順をご確認ください。","Start this window from your Codex session.\nAsk Codex to start Onecarat Agent Office CX, or use the documented explicit thread-ID command.");}
}
static class ObserverSecurity {
    static readonly HashSet<string> EnvironmentKeys=new HashSet<string>(new[]{"SYSTEMROOT","WINDIR","PATH","PATHEXT","USERPROFILE","TEMP","TMP","CODEX_HOME","CX_SESSIONS_DIR"},StringComparer.OrdinalIgnoreCase);
    public static Dictionary<string,string> CleanEnvironment(IDictionary source){var result=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(DictionaryEntry e in source){string key=e.Key as string,value=e.Value as string;if(key!=null&&value!=null&&EnvironmentKeys.Contains(key))result[key]=value;}return result;}
    public static string NodeCandidate(string path){if(string.IsNullOrWhiteSpace(path)||!Regex.IsMatch(path,@"^[A-Za-z]:[\\/]")||!Path.GetFileName(path).Equals("node.exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(path))throw new InvalidDataException("NODE_PATH_INVALID");return Path.GetFullPath(path);}
    public static string ResolveNode(string app,string cwd,string supplied,string search){
        string bundled=Path.Combine(app,"runtime","node.exe");if(File.Exists(bundled))return NodeCandidate(bundled);
        if(!string.IsNullOrEmpty(supplied))return NodeCandidate(supplied);
        foreach(string part in (search??"").Split(';')){try{if(!Regex.IsMatch(part,@"^[A-Za-z]:[\\/]"))continue;string dir=Path.GetFullPath(part).TrimEnd('\\','/');if(dir.Equals(Path.GetFullPath(app).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase)||dir.Equals(Path.GetFullPath(cwd).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase))continue;return NodeCandidate(Path.Combine(dir,"node.exe"));}catch(InvalidDataException){}catch(ArgumentException){}catch(NotSupportedException){}}
        throw new FileNotFoundException("NODE_NOT_FOUND");
    }
    public static string Activity(string value){switch(value){case "thinking":case "reading":case "researching":case "editing":case "running":case "reporting":case "reported":case "arrived":case "finished":case "session-ended":case "interrupted":case "approval":case "waiting":case "delegating":case "working":case "tool":return value;default:return "unknown";}}
    public static string Status(string value){switch(value){case "watching":case "partial":case "missing":case "starting":case "binding-error":return value;default:return "unavailable";}}
    public static string Approval(string value){switch(value){case "pending":case "uncertain":case "none":return value;case "":return "none";default:return "uncertain";}}
}
sealed class Actor11 {
    public string Id="",Activity="unknown",Approval="none";public double At,AssignedAt;public bool Fresh,Ended,SessionEnded;
    public DateTime Entered=DateTime.UtcNow,Changed=DateTime.UtcNow;public string Previous="unknown";
}
sealed class WindowLease : IDisposable {
    public Mutex Session,Slot;public EventWaitHandle Show;public int Index=-1;bool owns;
    public static string Prefix(){string sid=WindowsIdentity.GetCurrent().User.Value;return "Local\\OnecaratCX11-"+sid+"-";}
    public bool Acquire(string id){
        Session=new Mutex(false,Prefix()+id);try{owns=Session.WaitOne(0);}catch(AbandonedMutexException){owns=true;}
        if(!owns){for(int i=0;i<20;i++){try{using(var h=EventWaitHandle.OpenExisting(Prefix()+id+"-show"))h.Set();break;}catch(WaitHandleCannotBeOpenedException){Thread.Sleep(50);}}return false;}
        Show=new EventWaitHandle(false,EventResetMode.AutoReset,Prefix()+id+"-show");
        for(int i=0;i<32;i++){var m=new Mutex(false,Prefix()+"slot-"+i);bool ok;try{ok=m.WaitOne(0);}catch(AbandonedMutexException){ok=true;}if(ok){Slot=m;Index=i;break;}m.Dispose();}
        if(Index<0)throw new InvalidOperationException("WINDOW_LIMIT");return true;
    }
    public static Point Position(Rectangle area,Size size,int slot){int rows=Math.Max(1,(area.Height-24)/(size.Height+12));int cols=Math.Max(1,(area.Width-24)/(size.Width+12));int column=(slot/rows)%cols,row=slot%rows,lap=slot/(rows*cols);return new Point(Math.Max(area.Left,area.Right-12-size.Width-column*(size.Width+12)-lap*18),Math.Min(area.Bottom-size.Height,area.Top+12+row*(size.Height+12)+lap*18));}
    public void Dispose(){if(Slot!=null){Slot.ReleaseMutex();Slot.Dispose();}if(Show!=null)Show.Dispose();if(Session!=null){if(owns)Session.ReleaseMutex();Session.Dispose();}}
}
sealed class Stage11 : Form {
    public readonly string ThreadId;public readonly bool Japanese;public bool WorkerStopped;public int Samples;
    public readonly HashSet<string> Seen=new HashSet<string>();public readonly List<Actor11> Actors=new List<Actor11>();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();readonly object gate=new object();readonly JavaScriptSerializer json=new JavaScriptSerializer();
    readonly Font brand=new Font("Segoe UI",13,FontStyle.Bold),small=new Font("Yu Gothic UI",8),label=new Font("Yu Gothic UI",9,FontStyle.Bold);
    readonly Color ink=Color.FromArgb(45,65,64),teal=Color.FromArgb(37,126,111);readonly WindowLease lease;
    Process worker;string pending,status="starting";DateTime received=DateTime.MinValue,started=DateTime.UtcNow;double frame;bool motion=SystemInformation.UIEffectsEnabled;
    internal bool SyntheticPreview=false;internal string CapturePath="";internal int CaptureSeconds=8;
    public string ObserverStatus {get{return status;}}
    public Stage11(string id,bool ja,WindowLease windowLease){ThreadId=id;Japanese=ja;lease=windowLease;ClientSize=new Size(504,308);MinimumSize=new Size(360,260);MaximumSize=new Size(1000,700);AutoScaleMode=AutoScaleMode.Dpi;DoubleBuffered=true;TopMost=true;MaximizeBox=false;Text="Codex · "+Short(id)+" [CX1.1]";BackColor=Color.FromArgb(240,241,230);StartPosition=FormStartPosition.Manual;Location=WindowLease.Position(Screen.PrimaryScreen.WorkingArea,Size,lease==null?0:lease.Index);
        using(var resource=System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream("Onecarat.Office.ico")){if(resource!=null)using(var sourceIcon=new Icon(resource)){Icon=(Icon)sourceIcon.Clone();}}
        var menu=new ContextMenuStrip();var top=menu.Items.Add(T("最前面を切り替え","Toggle always on top"));top.Click+=delegate{TopMost=!TopMost;};var anim=menu.Items.Add(T("動きを止める／再開","Pause / resume motion"));anim.Click+=delegate{motion=!motion;};ContextMenuStrip=menu;
        timer.Interval=50;timer.Tick+=Tick;Shown+=delegate{if(!SyntheticPreview)StartWorker();timer.Start();};FormClosed+=delegate{timer.Stop();StopWorker();timer.Dispose();brand.Dispose();small.Dispose();label.Dispose();menu.Dispose();};
    }
    protected override bool ShowWithoutActivation{get{return true;}}
    string T(string j,string e){return Words11.T(Japanese,j,e);}static string Short(string s){return s.Substring(Math.Max(0,s.Length-8));}
    void StartWorker(){try{
        string entry=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"observer","main-v11.mjs");var si=new ProcessStartInfo(ObserverSecurity.ResolveNode(AppDomain.CurrentDomain.BaseDirectory,Environment.CurrentDirectory,Environment.GetEnvironmentVariable("CX_NODE_EXE"),Environment.GetEnvironmentVariable("PATH")),"\""+entry+"\"");si.UseShellExecute=false;si.CreateNoWindow=true;si.RedirectStandardInput=true;si.RedirectStandardOutput=true;si.RedirectStandardError=true;si.StandardOutputEncoding=Encoding.UTF8;si.WorkingDirectory=AppDomain.CurrentDomain.BaseDirectory;si.EnvironmentVariables.Clear();foreach(var pair in ObserverSecurity.CleanEnvironment(Environment.GetEnvironmentVariables()))si.EnvironmentVariables[pair.Key]=pair.Value;si.EnvironmentVariables["CX_OBSERVER_THREAD_ID"]=ThreadId;worker=new Process();worker.StartInfo=si;worker.OutputDataReceived+=delegate(object o,DataReceivedEventArgs e){if(e.Data!=null&&e.Data.Length<131072)lock(gate){pending=e.Data;}};worker.ErrorDataReceived+=delegate{};worker.Start();worker.BeginOutputReadLine();worker.BeginErrorReadLine();
    }catch{status="unavailable";}}
    void StopWorker(){if(worker==null){WorkerStopped=true;return;}try{worker.StandardInput.Close();if(!worker.WaitForExit(1500)){worker.Kill();worker.WaitForExit(1500);}WorkerStopped=worker.HasExited;}catch{}worker.Dispose();}
    static string S(Dictionary<string,object>d,string k){object v;return d.TryGetValue(k,out v)&&v is string?(string)v:"";}static bool B(Dictionary<string,object>d,string k){object v;return d.TryGetValue(k,out v)&&v is bool&&(bool)v;}
    internal void Receive(string line){try{
        var d=json.Deserialize<Dictionary<string,object>>(line);if(S(d,"thread")!=ThreadId)throw new InvalidDataException();status=ObserverSecurity.Status(S(d,"status"));received=DateTime.UtcNow;Samples++;var next=new List<Actor11>();var rows=d.ContainsKey("actors")?d["actors"] as ArrayList:null;
        if(rows!=null)foreach(object raw in rows){var v=raw as Dictionary<string,object>;if(v==null)continue;string id=S(v,"id");if(id!=ThreadId&&S(v,"parent")!=ThreadId)continue;if(!Regex.IsMatch(id,"^[a-zA-Z0-9_-]{1,100}$")||next.Exists(item=>item.Id==id))continue;var a=Actors.Find(x=>x.Id==id)??new Actor11{Id=id};string activity=ObserverSecurity.Activity(S(v,"activity"));if(activity!=a.Activity){a.Previous=a.Activity;a.Changed=DateTime.UtcNow;}a.Activity=activity;a.Approval=ObserverSecurity.Approval(S(v,"approval"));a.At=v.ContainsKey("at")?Convert.ToDouble(v["at"]):0;a.AssignedAt=v.ContainsKey("assignedAt")?Convert.ToDouble(v["assignedAt"]):0;a.Fresh=B(v,"fresh");a.Ended=B(v,"ended");a.SessionEnded=B(v,"sessionEnded");next.Add(a);Seen.Add(activity);}
        if(next.Count>0&&next[0].Id!=ThreadId)throw new InvalidDataException();if(next.Count==0&&!Healthy())return;Actors.Clear();Actors.AddRange(next);
    }catch{status="unavailable";Actors.Clear();}}
    bool Healthy(){return status=="watching"||status=="partial";}
    bool Fresh(Actor11 a){return a.Fresh&&Healthy()&&DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-a.At<15000;}
    string Approval(Actor11 a){if(a.Approval=="none"||a.Approval=="")return "none";return Healthy()&&Fresh(a)&&a.Approval=="pending"?"pending":"uncertain";}
    internal string Banner(){
        bool pending=false,uncertain=false;foreach(var a in Actors){pending|=Approval(a)=="pending";uncertain|=Approval(a)=="uncertain";}
        if(pending)return T("承認待ち · Codexで確認してください","Needs approval · respond in Codex");
        if(uncertain)return T("承認要求を観測 · 現在の解決状況は不明","Approval observed · resolution unknown");
        return "";
    }
    void Tick(object o,EventArgs e){string line;lock(gate){line=pending;pending=null;}if(line!=null)Receive(line);try{if(worker!=null&&worker.HasExited)status="unavailable";}catch{status="unavailable";}
        if(received!=DateTime.MinValue&&(DateTime.UtcNow-received).TotalSeconds>5)status="unavailable";
        if(lease!=null&&lease.Show.WaitOne(0)){if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Show();}
        string banner=Banner();Text=(SyntheticPreview?T("表示テスト · ","Display test · "):"")+(banner.Length>0?T("承認の確認 · ","Check approval · "):"")+"Codex · "+Short(ThreadId)+" [CX1.1]";
        if(motion&&WindowState!=FormWindowState.Minimized)frame+=0.05;if(WindowState!=FormWindowState.Minimized)Invalidate();
        if(CapturePath.Length>0&&(DateTime.UtcNow-started).TotalSeconds>=CaptureSeconds){SaveCapture();Close();}
    }
    internal void SaveCapture(){using(var b=new Bitmap(Width,Height)){DrawToBitmap(b,new Rectangle(Point.Empty,Size));b.Save(CapturePath,System.Drawing.Imaging.ImageFormat.Png);}File.WriteAllText(Path.ChangeExtension(CapturePath,"json"),json.Serialize(new {status=status,samples=Samples,actors=Actors.Count,activities=Seen,language=Japanese?"ja":"en",banner=Banner(),summary=TeamSummary(),visible=VisibleTeam().GetRange(0,Math.Min(3,VisibleTeam().Count)).ConvertAll(a=>a.Id),folded=Actors.FindAll(a=>Folded(a)).Count,thread=ThreadId,width=Width,height=Height,x=Left,y=Top}),new UTF8Encoding(false));}
    void Fill(Graphics g,Color c,float x,float y,float w,float h){using(var b=new SolidBrush(c))g.FillRectangle(b,x,y,w,h);}void Dot(Graphics g,Color c,float x,float y,float w,float h){using(var b=new SolidBrush(c))g.FillEllipse(b,x,y,w,h);}void Line(Graphics g,Color c,float width,float x,float y,float xx,float yy){using(var p=new Pen(c,width)){p.StartCap=p.EndCap=LineCap.Round;g.DrawLine(p,x,y,xx,yy);}}
    void TextAt(Graphics g,string s,Font f,Color c,float x,float y,float w){using(var transform=g.Transform)using(var font=new Font(f.FontFamily,f==brand?f.Size:Math.Max(f.Size,(f==label?9:8)/Math.Max(0.1f,Math.Abs(transform.Elements[0]))),f.Style))using(var b=new SolidBrush(c))using(var sf=new StringFormat()){sf.Trimming=StringTrimming.EllipsisCharacter;sf.FormatFlags=StringFormatFlags.NoWrap;g.DrawString(s,font,b,new RectangleF(x,y,w,34),sf);}}
    internal bool Folded(Actor11 a){return a.Id!=ThreadId&&Approval(a)=="none"&&(a.Activity=="finished"||a.Ended||a.SessionEnded)&&DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-a.At>=7000;}
    internal List<Actor11> VisibleTeam(){var list=DisplayOrder().FindAll(a=>!Folded(a));if(list.Count>=3&&String.CompareOrdinal(list[1].Id,list[2].Id)>0){var temp=list[1];list[1]=list[2];list[2]=temp;}return list;}
    internal string TeamSummary(){int turns=0,reports=0;foreach(var a in Actors)if(Folded(a)){if(a.Ended||a.SessionEnded)reports++;else turns++;}int outside=Math.Max(0,VisibleTeam().Count-3);var parts=new List<string>();if(turns>0)parts.Add(T("部下の最終記録：ターン終了 ","Agent records: turns ended ")+turns);if(reports>0)parts.Add(T("完了記録 ","Completion records ")+reports);if(outside>0)parts.Add(T("表示外の部下 ","Agents outside view ")+outside);return string.Join(" · ",parts.ToArray());}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
        // A fixed logical stage scales as one unit, including text and furniture.
        const float w=620,h=378;float scale=Math.Min(ClientSize.Width/w,ClientSize.Height/h);var canvas=g.Save();g.TranslateTransform((ClientSize.Width-w*scale)/2,(ClientSize.Height-h*scale)/2);g.ScaleTransform(scale,scale);
        using(var brush=new LinearGradientBrush(new Rectangle(0,0,620,378),Color.FromArgb(247,245,231),Color.FromArgb(219,232,221),90))g.FillRectangle(brush,0,0,w,h);
        Fill(g,Color.FromArgb(219,226,209),0,169,w,209);Line(g,Color.FromArgb(201,213,194),1,0,169,w,169);
        Dot(g,Color.FromArgb(204,218,203),38,219,530,121);
        Fill(g,Color.FromArgb(190,169,139),22,20,180,64);Fill(g,Color.FromArgb(253,251,236),26,24,172,56);TextAt(g,"Onecarat Labs",brand,ink,35,29,155);TextAt(g,"CODEX OFFICE",small,teal,36,58,150);
        bool night=DateTime.Now.Hour>=19||DateTime.Now.Hour<5;Fill(g,Color.FromArgb(250,249,235),502,24,91,83);Fill(g,night?Color.FromArgb(59,83,105):Color.FromArgb(156,209,215),507,29,81,73);Dot(g,Color.FromArgb(250,220,145),524,38,19,19);Fill(g,Color.FromArgb(250,249,235),546,29,4,73);Fill(g,Color.FromArgb(250,249,235),507,66,81,4);
        g.TranslateTransform(0,-16);var team=VisibleTeam();Actor11 root=Actors.Find(a=>a.Id==ThreadId);bool assigning=team.Exists(a=>AssignmentActive(a));
        if(root!=null){Desk(g,110,330,Fresh(root));Actor(g,90,319,root,false,assigning);TextAt(g,T("マネージャー","Manager"),label,teal,61,151,145);}
        var children=team.FindAll(a=>a.Id!=ThreadId);int count=Math.Min(2,children.Count);
        for(int i=0;i<count;i++){var a=children[i];float x=i==0?380:540,ground=i==0?253:343;
            var desk=g.Save();g.TranslateTransform(x,0);g.ScaleTransform(-1,1);Desk(g,20,ground,Fresh(a));g.Restore(desk);
            Actor(g,x,ground-11,a,true,AssignmentActive(a));TextAt(g,T("部下 · ","Agent · ")+Short(a.Id),label,ink,x-91,ground-179,152);
            if(AssignmentActive(a)){double elapsed=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-a.AssignedAt;float t=motion?(float)(elapsed/6000):0.5f;t=Math.Max(0,Math.Min(1,t));float px=129+(x-157)*t,py=241+(ground-89-241)*t-(float)Math.Sin(t*Math.PI)*22;Fill(g,Color.FromArgb(255,251,229),px-10,py-13,20,26);Line(g,teal,1,px-6,py-5,px+6,py-5);Line(g,teal,1,px-6,py+1,px+3,py+1);}
        }
        if(count==0){Plant(g,540,332);Fill(g,Color.FromArgb(244,244,228),278,150,264,76);TextAt(g,T("チームの作業スペース","Team workspace"),label,teal,295,165,235);TextAt(g,Actors.Count>1?T("終了したターンは下部にまとめています","Ended turns are summarized below"):T("部下を観測すると、ここに登場します","Observed subagents appear here"),small,ink,295,193,235);}
        if(root==null)TextAt(g,status=="starting"?T("オフィスを準備しています","Opening your office"):T("このセッションを観測できません","Cannot observe this session"),label,ink,38,190,450);
        g.TranslateTransform(0,16);Fill(g,Color.FromArgb(235,238,223),0,340,w,38);string summary=TeamSummary();
        string footer="";if(!Healthy())footer=T("観測を確認できません","Observation unavailable");else if(root!=null)footer=root.SessionEnded?Words11.Activity(Japanese,"session-ended"):root.Activity=="finished"?Words11.Activity(Japanese,"finished"):!Fresh(root)?T("現在の状態は不明","Current state unknown"):T("直近の観測","Last observed");string compact=summary.Replace("部下の最終記録：ターン終了 ","部下の終了ターン ").Replace("Agent records: turns ended ","Agent turns ended ");if(compact.Length>0)footer+=(footer.Length>0?"  |  ":"")+compact;TextAt(g,footer,small,ink,17,350,w-34);
        string banner=Banner();if(banner.Length>0){Fill(g,Color.FromArgb(250,224,171),0,0,w,24);TextAt(g,(SyntheticPreview?T("表示テスト · ","Display test · "):"")+banner,small,Color.FromArgb(104,68,23),9,3,w-18);using(var p=new Pen(Color.FromArgb(211,145,43),3))g.DrawRectangle(p,1,1,w-3,h-3);}else if(SyntheticPreview){Fill(g,Color.FromArgb(225,220,240),0,0,w,24);TextAt(g,T("表示テスト · 合成データ（実際のCodexの状態ではありません）","Display test · synthetic data, not live Codex activity"),small,ink,9,3,w-18);}AccessibleDescription=(SyntheticPreview?"DEMO · ":"")+(banner.Length>0?banner:footer)+" · "+summary;g.Restore(canvas);
    }
    internal bool AssignmentActive(Actor11 a){double age=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-a.AssignedAt;return a.Id!=ThreadId&&a.AssignedAt>0&&age>=0&&age<6000&&Healthy()&&!a.Ended;}
    internal List<Actor11> DisplayOrder(){var list=new List<Actor11>(Actors);list.Sort(delegate(Actor11 a,Actor11 b){if(a.Id==ThreadId)return b.Id==ThreadId?0:-1;if(b.Id==ThreadId)return 1;int ap=Approval(a)!="none"?-1:AssignmentActive(a)?0:Fresh(a)&&a.Activity!="finished"&&!a.Ended?1:2,bp=Approval(b)!="none"?-1:AssignmentActive(b)?0:Fresh(b)&&b.Activity!="finished"&&!b.Ended?1:2;int rank=ap.CompareTo(bp);return rank!=0?rank:b.At.CompareTo(a.At);});return list;}
    void Plant(Graphics g,float x,float floor){Fill(g,Color.FromArgb(181,132,94),x-9,floor-19,20,19);Line(g,teal,3,x,floor-19,x,floor-54);Dot(g,Color.FromArgb(98,150,106),x-18,floor-55,20,12);Dot(g,Color.FromArgb(122,166,115),x,floor-43,19,12);}
    void Desk(Graphics g,float x,float floor,bool active){Color wood=Color.FromArgb(162,130,98);Fill(g,wood,x,floor-44,83,7);Line(g,wood,4,x+8,floor-37,x+8,floor);Line(g,wood,4,x+76,floor-37,x+76,floor);Fill(g,ink,x+37,floor-83,37,29);Fill(g,active?Color.FromArgb(140,204,183):Color.FromArgb(146,166,161),x+41,floor-79,29,21);Line(g,ink,3,x+55,floor-54,x+55,floor-46);Fill(g,Color.FromArgb(250,248,231),x+9,floor-57,10,13);}
    void Actor(Graphics g,float x,float y,Actor11 a,bool child,bool assigning){float anchor=x;var pose=g.Save();g.TranslateTransform(x,0);if(child)g.ScaleTransform(-1,1);x=0;bool fresh=Fresh(a),moving=motion&&fresh;double age=Math.Max((DateTime.UtcNow-a.Changed).TotalSeconds,(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-a.At)/1000),arrival=(DateTime.UtcNow-a.Entered).TotalSeconds;float phase=(float)frame,bob=moving?(float)Math.Sin(phase*3)*2:0,beat=moving?(float)Math.Sin(phase*9)*3:0;
        bool entering=child&&arrival<1.5&&moving,leaving=child&&a.Ended&&age>4&&age<7&&motion;
        if(entering)x-=(float)(1-arrival/1.5)*40;if(leaving)x+=(float)(age-4)*35;
        float walk=entering||leaving?(float)Math.Sin(phase*10)*8:0;
        Dot(g,Color.FromArgb(183,201,183),x-17,y+6,46,9);
        Line(g,ink,3,x,y-36,x-10-walk,y+8);Line(g,ink,3,x,y-36,x+15+walk,y+8);
        bool bow=(a.Activity=="reported"||a.Activity=="finished")&&age<1.4&&fresh;
        float hx=x+(bow?9:0),hy=y-115+bob+(bow?9:0);Line(g,ink,3,hx,y-83+bob+(bow?5:0),x,y-36);Dot(g,Color.FromArgb(255,252,237),hx-15,hy,30,30);using(var p=new Pen(ink,2.4f))g.DrawEllipse(p,hx-15,hy,30,30);Dot(g,ink,hx+2,hy+11,2.5f,3);Dot(g,ink,hx+9,hy+11,2.5f,3);Line(g,ink,1.4f,hx+3,hy+21,hx+9,hy+21);
        if(!child){using(var b=new SolidBrush(teal))g.FillPolygon(b,new[]{new PointF(x,y-80),new PointF(x-4,y-69),new PointF(x,y-56),new PointF(x+4,y-69)});Line(g,teal,5,x-5,y-77,x-3,y-48);Line(g,teal,5,x+5,y-77,x+3,y-48);}else{Line(g,Color.FromArgb(169,127,68),2,x-5,y-78,x+6,y-65);Fill(g,Color.FromArgb(255,250,224),x+2,y-67,9,12);Line(g,teal,1,x+4,y-63,x+9,y-63);}
        string approval=Approval(a);bool raised=approval!="none"||((a.Activity=="finished"||a.Activity=="reported"||a.SessionEnded)&&age<7&&fresh);
        if(raised){Line(g,ink,3,x,y-76,x+18,y-88);Line(g,ink,3,x+18,y-88,x+25+beat,y-113);Line(g,ink,3,x,y-76,x-15,y-51);}
        else if(assigning){Line(g,ink,3,x,y-76,x+19,y-71);Line(g,ink,3,x+19,y-71,x+39,y-78+beat);Line(g,ink,3,x,y-76,x-12,y-50);}
        else if(fresh&&(a.Activity=="thinking")){Line(g,ink,3,x,y-76,x+21,y-67);Line(g,ink,3,x+21,y-67,hx+13,hy+23);Line(g,ink,3,x,y-76,x-15,y-50);for(int k=0;k<3;k++)Dot(g,teal,x+22+k*7,hy-6,3,3);}
        else if(fresh&&(a.Activity=="reading"||a.Activity=="researching")){Line(g,ink,3,x,y-76,x+26,y-56);Line(g,ink,3,x,y-76,x-12,y-56);Fill(g,Color.FromArgb(250,246,223),x+14,y-76,25,29);Line(g,teal,1,x+19,y-68,x+33,y-68);Line(g,teal,1,x+19,y-62,x+30,y-62);}
        else if(fresh&&a.Activity=="editing"){Line(g,ink,3,x,y-76,x+14,y-51);Line(g,ink,3,x+14,y-51,x+38,y-34+beat);Line(g,teal,2,x+35,y-45+beat,x+40,y-30+beat);Line(g,ink,3,x,y-76,x-12,y-50);}
        else if(fresh&&a.Activity!="finished"&&a.Activity!="reported"&&!a.SessionEnded){Line(g,ink,3,x,y-76,x+17,y-56);Line(g,ink,3,x+17,y-56,x+43,y-30+beat);Line(g,ink,3,x,y-76,x+3,y-54);Line(g,ink,3,x+3,y-54,x+34,y-29-beat);}
        else{Line(g,ink,3,x,y-76,x-14,y-47);Line(g,ink,3,x,y-76,x+16,y-47);}
        g.Restore(pose);string caption=approval=="pending"?Words11.Activity(Japanese,"approval"):approval=="uncertain"?T("承認状況不明","Approval unknown"):assigning?(child?T("依頼を受領","Receiving"):T("仕事を託す","Delegating")):a.Activity=="finished"||a.SessionEnded?Words11.Activity(Japanese,a.Activity):fresh?Words11.Activity(Japanese,a.Activity):T("状態不明","Unknown");TextAt(g,caption,small,approval!="none"?Color.FromArgb(157,95,26):teal,child?anchor-90:anchor-19,y-144,137);
    }
}
static class Entry11 {
    [STAThread]static int Main(string[] args){bool ja=DisplayLanguage.Detect()=="ja";if(Array.IndexOf(args,"--language")>=0){Console.WriteLine(ja?"ja":"en");return 0;}
        string id=Environment.GetEnvironmentVariable("CODEX_THREAD_ID");for(int i=0;i<args.Length;i++)if(args[i]=="--thread"&&i+1<args.Length)id=args[++i];
        if(id==null||!Regex.IsMatch(id,"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")){MessageBox.Show(Words11.Error(ja),"Onecarat Labs",MessageBoxButtons.OK,MessageBoxIcon.Information);return 2;}
        id=id.ToLowerInvariant();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        using(var lease=new WindowLease()){try{if(!lease.Acquire(id))return 10;Application.Run(new Stage11(id,ja,lease));return 0;}catch{MessageBox.Show(Words11.T(ja,"Officeを起動できません。小窓の数と実行環境を確認してください。","Office could not start. Check open windows and your runtime environment."),"Onecarat Labs");return 1;}}
    }
}
