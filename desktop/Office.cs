using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

sealed class Session {
    public string Id="", Parent="", Activity="unknown"; public bool Fresh; public double At;
    public override string ToString(){return (Parent.Length>0?"↳ ":"")+"Codex · "+Id.Substring(Math.Max(0,Id.Length-8));}
}
sealed class Office : Form {
    readonly Timer timer=new Timer(); readonly ComboBox selector=new ComboBox();
    readonly Button language=new Button(), pin=new Button(), motion=new Button();
    readonly object gate=new object(); readonly JavaScriptSerializer json=new JavaScriptSerializer();
    readonly List<Session> sessions=new List<Session>();
    Process worker; string pending, status="starting", selected="", capture=""; bool ja, animate=true;
    public bool WorkerStopped {get;private set;}
    DateTime received=DateTime.MinValue, launched=DateTime.UtcNow; double frame; int seconds=8, samples;
    readonly HashSet<string> observed=new HashSet<string>();
    readonly Font titleFont=new Font("Segoe UI",14,FontStyle.Bold), textFont=new Font("Yu Gothic UI",9), tinyFont=new Font("Yu Gothic UI",8), stateFont=new Font("Yu Gothic UI",11,FontStyle.Bold);
    readonly Color ink=Color.FromArgb(42,63,64), muted=Color.FromArgb(99,119,117), teal=Color.FromArgb(31,126,115);
    public Office(string[] args){
        ja=CultureInfo.CurrentUICulture.TwoLetterISOLanguageName=="ja";
        for(int i=0;i<args.Length;i++){if(args[i]=="--lang"&&i+1<args.Length)ja=args[++i]=="ja";else if(args[i]=="--capture"&&i+1<args.Length)capture=Path.GetFullPath(args[++i]);else if(args[i]=="--seconds"&&i+1<args.Length)int.TryParse(args[++i],out seconds);}
        Text="Onecarat · Codex Office"; ClientSize=new Size(580,370);MinimumSize=new Size(440,350);MaximumSize=new Size(1100,750);
        AutoScaleMode=AutoScaleMode.Dpi; DoubleBuffered=true; BackColor=Color.FromArgb(247,247,239);TopMost=true;
        StartPosition=FormStartPosition.Manual;Rectangle area=Screen.PrimaryScreen.WorkingArea;Location=new Point(area.Right-Width-24,area.Top+24);
        selector.DropDownStyle=ComboBoxStyle.DropDownList;selector.Font=textFont;selector.SetBounds(22,66,ClientSize.Width-44,28);selector.Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right;
        selector.SelectedIndexChanged+=delegate{if(selector.SelectedItem is Session)selected=((Session)selector.SelectedItem).Id;Invalidate();};Controls.Add(selector);
        Button[] buttons={motion,pin,language};for(int i=0;i<buttons.Length;i++){Button b=buttons[i];b.SetBounds(ClientSize.Width-177+i*54,17,54,28);b.Anchor=AnchorStyles.Top|AnchorStyles.Right;b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.Font=tinyFont;Controls.Add(b);}
        language.Click+=delegate{ja=!ja;Labels();}; pin.Click+=delegate{TopMost=!TopMost;Labels();};motion.Click+=delegate{animate=!animate;Labels();};
        Labels();timer.Interval=50;timer.Tick+=Tick;Shown+=delegate{StartWorker();timer.Start();};FormClosed+=delegate{StopWorker();timer.Dispose();titleFont.Dispose();textFont.Dispose();tinyFont.Dispose();stateFont.Dispose();};
    }
    protected override bool ShowWithoutActivation {get{return true;}}
    string T(string jp,string en){return ja?jp:en;}
    void Labels(){language.Text=ja?"EN":"日本語";language.AccessibleName="Language / 言語";pin.Text=TopMost?"●":"○";pin.AccessibleName=T("最前面を切り替え","Toggle always on top");motion.Text=animate?"Ⅱ":"▶";motion.AccessibleName=T("アニメーションを切り替え","Toggle animation");selector.AccessibleName=T("観測するセッション","Observed session");Invalidate();}
    void StartWorker(){try{
        string entry=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"observer","main.mjs");
        ProcessStartInfo si=new ProcessStartInfo(Environment.GetEnvironmentVariable("CX_NODE_EXE")??"node.exe","\""+entry+"\"");
        si.UseShellExecute=false;si.CreateNoWindow=true;si.RedirectStandardOutput=true;si.RedirectStandardError=true;si.RedirectStandardInput=true;si.StandardOutputEncoding=Encoding.UTF8;si.WorkingDirectory=AppDomain.CurrentDomain.BaseDirectory;
        si.EnvironmentVariables.Remove("OPENAI_API_KEY");si.EnvironmentVariables.Remove("CODEX_API_KEY");
        worker=new Process();worker.StartInfo=si;
        worker.OutputDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null&&e.Data.Length<131072)lock(gate){pending=e.Data;}};
        worker.ErrorDataReceived+=delegate{};worker.Start();worker.BeginOutputReadLine();worker.BeginErrorReadLine();
    }catch{status="unavailable";}}
    void StopWorker(){if(worker==null){WorkerStopped=true;return;}try{worker.StandardInput.Close();if(!worker.WaitForExit(1500)){worker.Kill();worker.WaitForExit(1500);}WorkerStopped=worker.HasExited;}catch{}worker.Dispose();}
    string S(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)&&v is string?(string)v:"";}
    void Receive(string line){try{
        var d=json.Deserialize<Dictionary<string,object>>(line);status=S(d,"status");received=DateTime.UtcNow;samples++;
        var next=new List<Session>();object raw;if(d.TryGetValue("sessions",out raw)&&raw is ArrayList)foreach(object o in (ArrayList)raw){
            var v=o as Dictionary<string,object>;if(v==null)continue;var s=new Session();s.Id=S(v,"id");s.Parent=S(v,"parent");s.Activity=S(v,"activity");s.Fresh=v.ContainsKey("fresh")&&v["fresh"] is bool&&(bool)v["fresh"];s.At=v.ContainsKey("at")?Convert.ToDouble(v["at"]):0;next.Add(s);observed.Add(s.Activity);
        }
        // Preserve selection and stable ordering; new sessions are appended.
        next.Sort(delegate(Session a,Session b){int parent=(a.Parent.Length>0?1:0).CompareTo(b.Parent.Length>0?1:0);if(parent!=0)return parent;int ia=sessions.FindIndex(x=>x.Id==a.Id),ib=sessions.FindIndex(x=>x.Id==b.Id);if(ia<0&&ib<0)return b.At.CompareTo(a.At);return (ia<0?999:ia).CompareTo(ib<0?999:ib);});
        bool changed=next.Count!=sessions.Count;for(int i=0;!changed&&i<next.Count;i++)changed=next[i].Id!=sessions[i].Id;
        sessions.Clear();sessions.AddRange(next);
        if(changed){selector.BeginUpdate();selector.Items.Clear();foreach(var s in sessions)selector.Items.Add(s);int index=sessions.FindIndex(x=>x.Id==selected);selector.SelectedIndex=index>=0?index:(sessions.Count>0?0:-1);selector.EndUpdate();}
        selector.Enabled=sessions.Count>0;
    }catch{status="unavailable";sessions.Clear();selector.Items.Clear();}}
    void Tick(object sender,EventArgs e){string line;lock(gate){line=pending;pending=null;}if(line!=null)Receive(line);
        try{if(worker!=null&&worker.HasExited)status="unavailable";}catch{status="unavailable";}
        if(received!=DateTime.MinValue&&(DateTime.UtcNow-received).TotalSeconds>5)status="unavailable";
        if(animate&&WindowState!=FormWindowState.Minimized)frame+=0.05;
        Session s=sessions.Find(x=>x.Id==selected);bool approval=s!=null&&s.Activity=="approval"&&s.Fresh&&status=="watching";
        Text=(approval?T("承認待ち · ","Needs approval · "):"")+"Onecarat · Codex Office";
        if(WindowState!=FormWindowState.Minimized)Invalidate();
        if(capture.Length>0&&(DateTime.UtcNow-launched).TotalSeconds>=Math.Max(2,seconds)){
            try{using(Bitmap b=new Bitmap(Width,Height)){DrawToBitmap(b,new Rectangle(Point.Empty,Size));b.Save(capture,System.Drawing.Imaging.ImageFormat.Png);}File.WriteAllText(Path.ChangeExtension(capture,"json"),json.Serialize(new {status=status,sessionCount=sessions.Count,samples=samples,activities=observed,language=ja?"ja":"en",nativeWindow=IsHandleCreated}),new UTF8Encoding(false));}catch{}Close();
        }
    }
    bool Fresh(Session s){return s!=null&&s.Fresh&&DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-s.At<15000&&(status=="watching"||status=="partial");}
    string Activity(string a){switch(a){case "working":return T("作業イベント","Work event");case "thinking":return T("思考","Thinking");case "running":return T("コマンド実行","Running a command");case "editing":return T("ファイル編集","Editing files");case "reading":return T("資料を確認","Reading");case "researching":return T("調べもの","Researching");case "reporting":return T("応答","Responding");case "delegating":return T("委任の呼び出し","Delegation call");case "waiting":return T("待機ツール","Wait tool");case "tool":return T("ツール呼び出し","Using a tool");case "approval":return T("承認待ち","Needs approval");case "finished":return T("ターン終了","Turn ended");case "interrupted":return T("ターン中断","Turn interrupted");default:return T("状態不明","State unknown");}}
    void Fill(Graphics g,Color c,float x,float y,float w,float h){using(var b=new SolidBrush(c))g.FillRectangle(b,x,y,w,h);}
    void Ellipse(Graphics g,Color c,float x,float y,float w,float h){using(var b=new SolidBrush(c))g.FillEllipse(b,x,y,w,h);}
    void Line(Graphics g,Color c,float width,float x,float y,float x2,float y2){using(var p=new Pen(c,width)){p.StartCap=p.EndCap=LineCap.Round;g.DrawLine(p,x,y,x2,y2);}}
    void Words(Graphics g,string t,Font font,Color c,float x,float y,float w){using(var b=new SolidBrush(c))using(var format=new StringFormat()){format.Trimming=StringTrimming.EllipsisCharacter;format.FormatFlags=StringFormatFlags.NoWrap;g.DrawString(t,font,b,new RectangleF(x,y,w,32),format);}}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);Graphics g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;float w=ClientSize.Width,h=ClientSize.Height;
        Words(g,"Onecarat Labs",titleFont,ink,22,13,210);Words(g,"CODEX OFFICE",tinyFont,muted,23,43,150);
        Session s=sessions.Find(x=>x.Id==selected);bool fresh=Fresh(s);string a=s==null?"unknown":s.Activity;
        string note=status=="missing"?T("ログがまだありません · Codexで作業を始めてください","No logs yet · start working in Codex"):status=="unavailable"?T("観測できません · Node.jsとログの場所を確認","Observer unavailable · check Node.js and log location"):s==null?T("Codexの活動を待っています","Waiting for Codex activity"):fresh?T("直近の観測 · ","Just observed · ")+Activity(a):T("現在の状態は不明 · 最終記録: ","Current state unknown · last: ")+Activity(a);
        Ellipse(g,fresh?teal:Color.FromArgb(168,178,168),23,111,7,7);Words(g,note,textFont,ink,37,103,w-54);
        float floor=h-69;
        // Quiet, warm office. Time of day affects scenery only, never activity state.
        bool night=DateTime.Now.Hour>=19||DateTime.Now.Hour<5;
        Fill(g,night?Color.FromArgb(223,232,228):Color.FromArgb(232,240,229),0,140,w,floor-140);
        Fill(g,Color.FromArgb(217,224,208),0,floor,w,30);Line(g,Color.FromArgb(193,205,190),1,0,floor,w,floor);
        Fill(g,Color.FromArgb(255,255,248),w-147,155,112,76);Fill(g,night?Color.FromArgb(61,85,102):Color.FromArgb(174,216,215),w-141,161,100,64);
        Ellipse(g,Color.FromArgb(251,226,157),w-115,171,18,18);Fill(g,Color.FromArgb(255,255,248),w-94,161,5,64);Fill(g,Color.FromArgb(255,255,248),w-141,191,100,4);
        Plant(g,w-43,floor-3);
        var cast=new List<Session>();if(s!=null){cast.Add(s);foreach(var child in sessions)if(child.Parent==s.Id&&child.Id!=s.Id)cast.Add(child);}
        int capacity=Math.Max(1,(int)((w-145)/145));int count=Math.Min(cast.Count,capacity);
        if(count==0){Desk(g,95,floor,false);Words(g,T("あなたの作業は、いつものCodexで。","Your work stays in Codex."),textFont,muted,25,floor+6,w-50);}
        else {for(int i=0;i<count;i++){float x=65+i*145;Desk(g,x+28,floor,Fresh(cast[i]));Figure(g,x,floor-17,cast[i],i==0);}
            if(cast.Count>count)Words(g,"+"+(cast.Count-count),stateFont,teal,w-195,244,60);
            string role=s.Parent.Length>0?T("サブエージェント","Subagent"):T("セッション","Session");
            string stamp=s.At>0?DateTimeOffset.FromUnixTimeMilliseconds((long)s.At).LocalDateTime.ToString("HH:mm:ss"):"—";
            Words(g,role+" · "+s.Id.Substring(Math.Max(0,s.Id.Length-8))+"     "+T("最終観測 ","Last seen ")+stamp,tinyFont,muted,22,floor+7,w-44);
        }
        Words(g,T("観測専用 · 承認はCodexで確認","Read only · check approvals in Codex"),tinyFont,muted,22,h-27,w-44);
        if(a=="approval"&&fresh){using(var p=new Pen(Color.FromArgb(214,146,46),4))g.DrawRectangle(p,2,2,w-4,h-4);}
        AccessibleDescription=note;
    }
    void Plant(Graphics g,float x,float y){Fill(g,Color.FromArgb(191,143,105),x-9,y-19,20,19);Line(g,teal,3,x,y-19,x,y-53);Ellipse(g,Color.FromArgb(100,154,117),x-19,y-54,20,12);Ellipse(g,Color.FromArgb(117,170,126),x,y-43,18,12);}
    void Desk(Graphics g,float x,float floor,bool active){Color wood=Color.FromArgb(178,145,111);Fill(g,wood,x,floor-42,83,7);Line(g,wood,4,x+8,floor-35,x+8,floor);Line(g,wood,4,x+76,floor-35,x+76,floor);Fill(g,ink,x+35,floor-81,39,29);Fill(g,active?Color.FromArgb(143,206,188):Color.FromArgb(152,172,169),x+39,floor-77,31,21);Line(g,ink,3,x+54,floor-52,x+54,floor-44);Fill(g,Color.FromArgb(247,245,228),x+7,floor-55,11,12);}
    void Figure(Graphics g,float x,float y,Session s,bool main){bool live=Fresh(s);string a=s.Activity;float beat=live&&animate?(float)Math.Sin(frame*7):0;float bob=live&&animate?(float)Math.Sin(frame*3)*1.5f:0;
        Ellipse(g,Color.FromArgb(196,209,194),x-15,y+12,48,8);
        Line(g,ink,3,x,y-36,x-9,y+12);Line(g,ink,3,x,y-36,x+16,y+12);
        Line(g,ink,3,x,y-83+bob,x,y-36);Ellipse(g,Color.FromArgb(255,252,238),x-15,y-113+bob,30,30);
        using(var p=new Pen(ink,2.5f))g.DrawEllipse(p,x-15,y-113+bob,30,30);
        Ellipse(g,ink,x+2,y-101+bob,2.5f,3);Ellipse(g,ink,x+9,y-101+bob,2.5f,3);
        Line(g,ink,1.4f,x+3,y-92+bob,x+9,y-92+bob);
        if(main){using(var b=new SolidBrush(teal))g.FillPolygon(b,new[]{new PointF(x,y-80),new PointF(x-4,y-69),new PointF(x,y-56),new PointF(x+4,y-69)});}
        if(live&&(a=="finished"||a=="approval")){Line(g,ink,3,x,y-76,x+20,y-89);Line(g,ink,3,x+20,y-89,x+27+beat*4,y-113);Line(g,ink,3,x,y-76,x-16,y-52);}
        else if(live&&(a=="thinking"||a=="reading"||a=="researching")){Line(g,ink,3,x,y-76,x+22,y-69);Line(g,ink,3,x+22,y-69,x+13,y-91);Line(g,ink,3,x,y-76,x-12,y-52);for(int k=0;k<3;k++)Ellipse(g,teal,x+21+k*7,y-120+(float)Math.Sin(frame*3+k)*2,3,3);}
        else if(live){Line(g,ink,3,x,y-76,x+17,y-57);Line(g,ink,3,x+17,y-57,x+43,y-29+beat*3);Line(g,ink,3,x,y-76,x+4,y-53);Line(g,ink,3,x+4,y-53,x+34,y-28-beat*3);}
        else{Line(g,ink,3,x,y-76,x-14,y-47);Line(g,ink,3,x,y-76,x+16,y-47);}
        Words(g,live?Activity(a):T("状態不明","Unknown"),tinyFont,live?teal:muted,x-32,y-146,137);
    }
    [STAThread]static void Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Office(args));}
}
