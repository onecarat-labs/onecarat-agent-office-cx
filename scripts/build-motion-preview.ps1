$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'dist/preview'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$icon = Join-Path $root 'assets/icon/onecarat-office.ico'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /main:MotionPreview /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/win32icon:$icon" "/resource:$icon,Onecarat.Office.ico" "/out:$out/Office-Motion-Preview.exe" (Join-Path $root 'desktop/V11.cs') (Join-Path $root 'desktop/MotionPreview.cs')
if ($LASTEXITCODE -ne 0) { throw 'Preview compilation failed' }
Write-Output 'Built separate synthetic preview. No observer or Codex process is started.'
