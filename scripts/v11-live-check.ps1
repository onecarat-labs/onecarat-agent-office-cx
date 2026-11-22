$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$artifactRoot = Join-Path $projectRoot 'artifacts/v11'
New-Item -ItemType Directory -Force -Path $artifactRoot,(Join-Path $projectRoot '.cx/v11-tests/tmp') | Out-Null
$env:TEMP = Join-Path $projectRoot '.cx/v11-tests/tmp'
$env:TMP = $env:TEMP
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
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
'@
$checkRaw = & node (Join-Path $projectRoot 'scripts/launch-office.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'Binding preflight failed' }
$binding = $checkRaw | ConvertFrom-Json
$suffix = $binding.thread.Substring($binding.thread.Length - 8)
$before = @([CXWindowProbe]::Find($suffix))
& node (Join-Path $projectRoot 'scripts/launch-office.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher failed' }
Start-Sleep -Seconds 3
$first = @([CXWindowProbe]::Find($suffix))
& node (Join-Path $projectRoot 'scripts/launch-office.mjs')
Start-Sleep -Seconds 2
$second = @([CXWindowProbe]::Find($suffix))
$captured = $false
if ($second.Count -eq 1) { $captured = [CXWindowProbe]::Capture($second[0],(Join-Path $artifactRoot 'live-window.png')) }
$newWindows = @($second | Where-Object { $before -notcontains $_ })
foreach ($handle in $newWindows) { [CXWindowProbe]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null }
Start-Sleep -Seconds 2
$after = @([CXWindowProbe]::Find($suffix))
$result = [pscustomobject]@{ time=(Get-Date).ToUniversalTime().ToString('o'); binding=$binding.binding; language=$binding.language; firstWindowCount=$first.Count; repeatWindowCount=$second.Count; reusedSameHandle=($first.Count -eq 1 -and $second.Count -eq 1 -and $first[0] -eq $second[0]); screenshot=$captured; createdWindowsClosed=($after.Count -eq $before.Count); codexStarted=$false }
$result | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'live-launch.json')
$result | Format-List
if ($first.Count -ne 1 -or $second.Count -ne 1 -or -not $result.reusedSameHandle -or -not $captured -or -not $result.createdWindowsClosed) { exit 1 }
