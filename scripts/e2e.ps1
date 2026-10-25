param([switch]$SkipBuild, [switch]$KeepRunning)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $composeArgs = @('compose', '--env-file', '.env.example', '-p', 'padel-e2e')
    $upArgs = @('up', '-d', '--wait', '--wait-timeout', '480')
    if (-not $SkipBuild) { $upArgs += '--build' }
    & docker @composeArgs @upArgs
    if ($LASTEXITCODE -ne 0) { throw 'The dedicated test stack failed to start.' }
    & node scripts/e2e.mjs --resilience
    $testExitCode = $LASTEXITCODE
} finally {
    New-Item -ItemType Directory -Force test-results | Out-Null
    & docker @composeArgs ps -a | Out-File test-results/compose-status.txt -Encoding utf8
    & docker @composeArgs logs --no-color | Out-File test-results/compose.log -Encoding utf8
    if (-not $KeepRunning) { & docker @composeArgs down }
    Pop-Location
}
if ($null -eq $testExitCode) { exit 1 }
exit $testExitCode
