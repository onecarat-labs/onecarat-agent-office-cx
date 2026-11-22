$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$outputRoot = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path (Join-Path $outputRoot 'observer') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'observer/main.mjs'),(Join-Path $projectRoot 'observer/model.mjs'),(Join-Path $projectRoot 'observer/watcher.mjs') -Destination (Join-Path $outputRoot 'observer')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$outputRoot/Onecarat-CX.exe" (Join-Path $projectRoot 'desktop/Office.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed' }
Write-Output 'Built dist/Onecarat-CX.exe'
