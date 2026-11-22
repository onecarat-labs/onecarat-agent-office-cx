$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$env:TEMP = Join-Path $projectRoot '.cx/v11-tests/tmp'
$env:TMP = $env:TEMP
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot 'WindowProbe.cs')
$fixture = Join-Path $projectRoot '.cx/v11-tests/product-review'
$out = Join-Path $projectRoot 'artifacts/visual-review/final'
New-Item -ItemType Directory -Force -Path $fixture,$out | Out-Null
$id = '99999999-9999-9999-9999-999999999999'
$stamp = (Get-Date).ToUniversalTime().ToString('o')
$rows = @(
 @{timestamp=$stamp;type='session_meta';payload=@{id=$id}},
 @{timestamp=$stamp;type='event_msg';payload=@{type='task_started';turn_id='visual'}},
 @{timestamp=$stamp;type='event_msg';payload=@{type='item_completed';turn_id='visual';item=@{type='SubAgentActivity';kind='started';agent_thread_id='55555555-5555-5555-5555-555555555555'}}},
 @{timestamp=$stamp;type='event_msg';payload=@{type='item_completed';turn_id='visual';item=@{type='SubAgentActivity';kind='started';agent_thread_id='66666666-6666-6666-6666-666666666666'}}}
)
$content = ($rows | ForEach-Object { ConvertTo-Json $_ -Depth 6 -Compress }) -join "`n"
[IO.File]::WriteAllText((Join-Path $fixture "rollout-preview-$id.jsonl"),$content+"`n",(New-Object Text.UTF8Encoding($false)))
$env:CX_SESSIONS_DIR = $fixture
$env:CX_NODE_EXE = (Get-Command node.exe).Source
$exe = Join-Path $projectRoot 'dist/v1.1-secure/Onecarat-CX.exe'
$owned = Start-Process -FilePath $exe -ArgumentList @('--thread',$id) -PassThru
try {
 Start-Sleep -Seconds 2
 $windows = @([CXWindowProbe]::Find('99999999'))
 if ($windows.Count -ne 1) { throw 'Expected one product window on this desktop' }
 $capture = [CXWindowProbe]::Capture($windows[0],(Join-Path $out 'product-exe.png'))
 if (-not $capture) { throw 'Product capture failed' }
 [pscustomobject]@{exe=$exe;input='synthetic JSONL';desktop='tool desktop, not user desktop';windowCount=$windows.Count;captured=$capture;time=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out 'product-exe.json')
} finally {
 if (-not $owned.HasExited) { $owned.CloseMainWindow() | Out-Null; if (-not $owned.WaitForExit(5000)) { throw 'Review window did not close' } }
}
Write-Output 'Built product EXE opened, captured and closed. Synthetic log; isolated desktop.'
