param([ValidateSet('test','harness','development','evaluation')][string]$Mode='test')
$ErrorActionPreference='Stop'
$padelEvalRoot=Split-Path $PSScriptRoot -Parent
$padelNodeCandidates=@((Get-Command node -ErrorAction SilentlyContinue).Source,(Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'))
$padelNodeExecutable=$null
foreach($candidate in $padelNodeCandidates) {
    if($candidate -and (Test-Path -LiteralPath $candidate)) {
        $version=[version]((& $candidate --version).TrimStart('v'))
        if($version -ge [version]'22.22.0') { $padelNodeExecutable=$candidate; break }
    }
}
if(-not $padelNodeExecutable) { throw 'Install Node >=22.22.0 (Node 24 LTS recommended) before running AI evals.' }
Push-Location $padelEvalRoot
try {
    if($Mode -eq 'test') { & $padelNodeExecutable --test evals/tests/*.test.mjs }
    elseif($Mode -eq 'harness') { & $padelNodeExecutable evals/harness-check.mjs }
    else { & $padelNodeExecutable scripts/evaluate-assistant.mjs --split $Mode }
    exit $LASTEXITCODE
} finally { Pop-Location }
