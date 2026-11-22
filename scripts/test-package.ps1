$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$env:TEMP = Join-Path $root '.cx/v11-tests/tmp'
$env:TMP = $env:TEMP
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot 'WindowProbe.cs')
$env:CX_SESSIONS_DIR = Join-Path $root '.cx/v11-tests/product-review'
$id = '99999999-9999-9999-9999-999999999999'
$out = Join-Path $root 'artifacts/security-review'
$before = @([CXWindowProbe]::Find('99999999'))
if ($before.Count -ne 0) { throw 'Test identity is already in use' }
try {
 & node (Join-Path $root 'release/onecarat-cx-secure/scripts/launch-office.mjs') --thread $id
 if ($LASTEXITCODE -ne 0) { throw 'Package launcher failed' }
 Start-Sleep -Seconds 2
 $windows = @([CXWindowProbe]::Find('99999999'))
 if ($windows.Count -ne 1) { throw 'Expected one package window' }
 if (-not [CXWindowProbe]::Capture($windows[0],(Join-Path $out 'package-window.png'))) { throw 'Package capture failed' }
 [pscustomobject]@{packageLaunch=$true;windowCount=1;data='synthetic';installed=$false;aclVerified=$false;desktop='isolated'} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out 'package-test.json')
} finally {
 foreach ($handle in @([CXWindowProbe]::Find('99999999'))) { [CXWindowProbe]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null }
}
Write-Output 'Staged package launcher and UI verified. No protected installation was performed.'
