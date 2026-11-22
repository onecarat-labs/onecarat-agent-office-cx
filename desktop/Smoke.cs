// Separate test executable, never included in the product build.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Web.Script.Serialization;
using System.Windows.Forms;
static class Smoke {
    [STAThread] static int Main(string[] args){
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        var form=new Office(args);var checks=new Dictionary<string,bool>();var timer=new Timer();Process owned=null;
        timer.Interval=3000;timer.Tick+=delegate{
            timer.Stop();
            try {
                ComboBox combo=null;var buttons=new List<Button>();foreach(Control c in form.Controls){if(c is ComboBox)combo=(ComboBox)c;if(c is Button)buttons.Add((Button)c);}
                checks["sessionSelector"]=combo!=null&&combo.Items.Count>=2;
                checks["rootFirst"]=combo.Items.Count>0&&!combo.Items[0].ToString().StartsWith("↳");
                if(combo.Items.Count>=2){combo.SelectedIndex=1;checks["selection"]=combo.SelectedIndex==1;combo.SelectedIndex=0;}
                foreach(Button b in buttons){string before=b.Text;bool top=form.TopMost;b.PerformClick();checks[b.AccessibleName]=b.Text!=before;b.PerformClick();checks["restored-"+b.AccessibleName]=b.Text==before&&form.TopMost==top;}
                form.WindowState=FormWindowState.Minimized;checks["minimize"]=form.WindowState==FormWindowState.Minimized;form.WindowState=FormWindowState.Normal;
                var size=form.Size;form.Size=new System.Drawing.Size(100,100);checks["minimumSize"]=form.Width>=form.MinimumSize.Width;form.Size=size;
                var field=typeof(Office).GetField("worker",BindingFlags.Instance|BindingFlags.NonPublic);owned=(Process)field.GetValue(form);
                checks["workerRunning"]=owned!=null&&!owned.HasExited;
            }catch{checks["exception"]=false;}
        };
        form.Shown+=delegate{timer.Start();};Application.Run(form);timer.Dispose();
        // The process handle may already be disposed by the form; compare its recorded PID via reflection is not needed.
        checks["windowClosed"]=form.IsDisposed;checks["ownedWorkerExited"]=form.WorkerStopped;
        string dest=Environment.GetEnvironmentVariable("CX_SMOKE_RESULT");if(dest!=null)File.WriteAllText(dest,new JavaScriptSerializer().Serialize(checks));
        foreach(bool ok in checks.Values)if(!ok)return 1;return checks.Count>0?0:1;
    }
}
