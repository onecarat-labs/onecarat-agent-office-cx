param([string]$Pass = 'pass1')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$out = Join-Path $projectRoot "artifacts/visual-review/$Pass"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$exe = Join-Path $projectRoot 'dist/v1.1-secure/Visual-Review.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /main:VisualReview /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$exe" (Join-Path $projectRoot 'desktop/V11.cs') (Join-Path $projectRoot 'desktop/VisualReview.cs')
if ($LASTEXITCODE -ne 0) { throw 'Review compilation failed' }
foreach ($mode in @('delegating','done','english','approval','overflow','small','large','live')) {
 & $exe $mode (Join-Path $out "$mode.png") | Out-Null
 if ($LASTEXITCODE -ne 0) { throw "Review failed: $mode" }
}
Write-Output "Captured review windows in $out (synthetic scenarios plus live log observation)."
