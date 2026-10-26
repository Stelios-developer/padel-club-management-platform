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
# Persist only the modified owner/DACL sections. Audit rules are not changed
# and do not require the account's SeSecurityPrivilege on repeated calls.
$taskDirectory = New-Object System.IO.DirectoryInfo($targetPath)
$taskDirectory.SetAccessControl($taskAcl)
$taskActual = $taskDirectory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner)
$taskAllowed = @($ownerSid.Value, 'S-1-5-18', 'S-1-5-32-544')
$taskRules = $taskActual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
if (-not $taskActual.AreAccessRulesProtected -or $taskActual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $ownerSid.Value -or $taskRules.Count -ne 3) { throw 'Private directory owner/DACL verification failed' }
foreach ($taskRule in $taskRules) {
  if ($taskRule.IdentityReference.Value -notin $taskAllowed -or $taskRule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or ($taskRule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'Unexpected private directory access rule' }
}
Write-Output 'Protected deployment directory for the current user, SYSTEM and local administrators.'
