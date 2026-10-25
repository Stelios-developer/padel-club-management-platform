param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.runtime')).TrimEnd('\') + '\'
$targetPath = [IO.Path]::GetFullPath($Path)
if (-not $targetPath.StartsWith($runtimeRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Secrets must stay inside the project .runtime directory' }
$taskAcl = New-Object System.Security.AccessControl.DirectorySecurity
$taskAcl.SetAccessRuleProtection($true, $false)
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$taskAcl.SetOwner($ownerSid)
foreach ($taskSid in @($ownerSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
  $taskIdentity = New-Object Security.Principal.SecurityIdentifier($taskSid)
  $taskRule = New-Object Security.AccessControl.FileSystemAccessRule($taskIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $taskAcl.AddAccessRule($taskRule)
}
Set-Acl -LiteralPath $targetPath -AclObject $taskAcl
Write-Output 'Protected deployment directory for the current user, SYSTEM and local administrators.'
