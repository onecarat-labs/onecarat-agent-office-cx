using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Drawing;
public static class CXWindowProbe {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 public struct Rect {public int L,T,R,B;}
 public static IntPtr[] Find(string suffix){var found=new List<IntPtr>();EnumWindows(delegate(IntPtr h,IntPtr p){var b=new StringBuilder(512);GetWindowText(h,b,512);if(IsWindowVisible(h)&&b.ToString().Contains(suffix)&&b.ToString().EndsWith("[CX1.1]"))found.Add(h);return true;},IntPtr.Zero);return found.ToArray();}
 public static bool Capture(IntPtr h,string path){Rect r;if(!GetWindowRect(h,out r))return false;using(var b=new Bitmap(r.R-r.L,r.B-r.T))using(var g=Graphics.FromImage(b)){var dc=g.GetHdc();bool ok;try{ok=PrintWindow(h,dc,2);}finally{g.ReleaseHdc(dc);}if(ok)b.Save(path,System.Drawing.Imaging.ImageFormat.Png);return ok;}}
}