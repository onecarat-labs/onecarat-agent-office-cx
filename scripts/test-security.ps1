$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'artifacts/security-review'
$temp = Join-Path $root '.cx/security-tests/native'
New-Item -ItemType Directory -Force -Path $out,$temp | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe = Join-Path $out 'Security-Smoke.exe'
& $compiler /nologo /target:exe /main:SecuritySmoke /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$exe" (Join-Path $root 'desktop/V11.cs') (Join-Path $root 'desktop/SecuritySmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Security check compilation failed' }
& $exe $temp
if ($LASTEXITCODE -ne 0) { throw 'Native security checks failed' }
Copy-Item -LiteralPath (Join-Path $temp 'results.json') -Destination (Join-Path $out 'native-results.json')
Get-Content -Encoding utf8 (Join-Path $out 'native-results.json')
