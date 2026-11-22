param([switch]$ValidateOnly,[switch]$ReviewedPackage,[string]$NodeExe = 'C:\Program Files\nodejs\node.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$package = Join-Path $projectRoot 'release/onecarat-cx-secure'
$manifestPath = Join-Path $package 'manifest.json'
$expected = @('Onecarat-CX.exe','observer/model.mjs','observer/watcher.mjs','observer/binding.mjs','observer/model-v11.mjs','observer/main-v11.mjs','observer/safe-file.mjs','observer/environment.mjs','scripts/launch-office.mjs')
function Assert-NoReparse([string]$Path) {
 $item = Get-Item -LiteralPath $Path -Force
 while ($null -ne $item) {
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is not allowed: $($item.FullName)" }
  if ($item -is [IO.FileInfo]) { $item = $item.Directory } else { $item = $item.Parent }
 }
}
Assert-NoReparse $manifestPath
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
if ($manifest.format -ne 1 -or $manifest.files.Count -ne $expected.Count) { throw 'Unexpected package format' }
$seen = @{}
foreach ($entry in $manifest.files) {
 if ($entry.path -cnotin $expected -or $seen.ContainsKey($entry.path)) { throw 'Unexpected or duplicate package file' }
 $seen[$entry.path] = $true
 $source = Join-Path $package $entry.path
 Assert-NoReparse $source
 if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ine $entry.sha256) { throw "Package hash mismatch: $($entry.path)" }
}
if ($ValidateOnly) { Write-Output 'Package contents and hashes verified. No installation or ACL changes performed.'; return }
if (-not $ReviewedPackage) { throw 'Review the package and script first, then run manually with -ReviewedPackage. Hashes are not a signature.' }
if ($NodeExe -notmatch '^[A-Za-z]:[\\/]' -or [IO.Path]::GetFileName($NodeExe) -ine 'node.exe') { throw 'An explicit absolute node.exe path is required' }
Assert-NoReparse $NodeExe
$nodeFull = [IO.Path]::GetFullPath($NodeExe)
if ($nodeFull.StartsWith($projectRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a trusted Node installation outside the development folder' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
foreach ($group in $identity.Groups) { try { $name=$group.Translate([Security.Principal.NTAccount]).Value } catch { continue }; if ($name -match 'CodexSandbox') { throw 'Run manually as the normal Windows user, outside Codex sandbox' } }
$programs = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs'
if (-not (Test-Path -LiteralPath $programs)) { New-Item -ItemType Directory -Path $programs | Out-Null }
Assert-NoReparse $programs
$target = Join-Path $programs 'OnecaratCX'
if (Test-Path -LiteralPath $target) { throw 'Install folder already exists. Do not overwrite a running or unreviewed installation; review an update separately.' }
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner($identity.User)
foreach ($sid in @($identity.User,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
 $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit, ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
}
# Create the directory with its private ACL before placing executable content.
[IO.Directory]::CreateDirectory($target,$acl) | Out-Null
foreach ($entry in $manifest.files) {
 $destination = Join-Path $target $entry.path
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
 Copy-Item -LiteralPath (Join-Path $package $entry.path) -Destination $destination
 if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ine $entry.sha256) { throw 'Installed file verification failed; do not launch this copy' }
}
$runtime = Join-Path $target 'runtime'
[IO.Directory]::CreateDirectory($runtime) | Out-Null
$nodeHash = (Get-FileHash -LiteralPath $nodeFull -Algorithm SHA256).Hash
Copy-Item -LiteralPath $nodeFull -Destination (Join-Path $runtime 'node.exe')
if ((Get-FileHash -LiteralPath (Join-Path $runtime 'node.exe') -Algorithm SHA256).Hash -ne $nodeHash) { throw 'Node copy verification failed' }
$allowedSids = @($identity.User.Value,'S-1-5-18','S-1-5-32-544')
$items = @((Get-Item -LiteralPath $target)) + @(Get-ChildItem -LiteralPath $target -Recurse -Force)
foreach ($item in $items) {
 Assert-NoReparse $item.FullName
 foreach ($rule in (Get-Acl -LiteralPath $item.FullName).Access) {
  $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if ($rule.AccessControlType -eq 'Allow' -and $sid -notin $allowedSids) { throw "Unexpected access rule: $($item.FullName). Do not launch." }
 }
}
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $target 'manifest.json')
Write-Output "Installed reviewed copy with private ACL: $target"
Write-Output 'No application or Codex session was launched. Confirm the ACL with icacls before launching.'
