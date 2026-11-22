$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$outputRoot = Join-Path $projectRoot 'dist/v1.1-secure'
New-Item -ItemType Directory -Force -Path (Join-Path $outputRoot 'observer') | Out-Null
foreach ($name in @('model.mjs','watcher.mjs','binding.mjs','model-v11.mjs','main-v11.mjs','safe-file.mjs','environment.mjs')) { Copy-Item -LiteralPath (Join-Path $projectRoot "observer/$name") -Destination (Join-Path $outputRoot 'observer') }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$iconPath = Join-Path $projectRoot 'assets/icon/onecarat-office.ico'
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/win32icon:$iconPath" "/resource:$iconPath,Onecarat.Office.ico" "/out:$outputRoot/Onecarat-CX.exe" (Join-Path $projectRoot 'desktop/V11.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed' }
Write-Output 'Built dist/v1.1-secure/Onecarat-CX.exe'
