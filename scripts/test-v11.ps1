$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$testExe = Join-Path $projectRoot 'dist/v1.1-secure/Office-Smoke.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /main:Smoke11 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$testExe" (Join-Path $projectRoot 'desktop/V11.cs') (Join-Path $projectRoot 'desktop/V11Smoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed' }
try { & node (Join-Path $projectRoot 'scripts/v11-desktop-check.mjs'); $resultCode = $LASTEXITCODE; if ($resultCode -eq 0) { & node (Join-Path $projectRoot 'scripts/v11-team-preview.mjs'); $resultCode = $LASTEXITCODE } }
finally { Remove-Item -LiteralPath $testExe -ErrorAction SilentlyContinue }
exit $resultCode
