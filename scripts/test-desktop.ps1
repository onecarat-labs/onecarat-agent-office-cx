$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$testExe = Join-Path $projectRoot 'dist/Office-Smoke.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /main:Smoke /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$testExe" (Join-Path $projectRoot 'desktop/Office.cs') (Join-Path $projectRoot 'desktop/Smoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed' }
try { & node (Join-Path $projectRoot 'scripts/desktop-smoke.mjs'); $resultCode = $LASTEXITCODE }
finally { Remove-Item -LiteralPath $testExe -ErrorAction SilentlyContinue }
exit $resultCode
