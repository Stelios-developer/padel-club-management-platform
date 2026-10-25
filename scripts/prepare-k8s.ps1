$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& node (Join-Path $projectRoot 'scripts/sync-k8s-config.mjs')
exit $LASTEXITCODE
