param([Parameter(ValueFromRemainingArguments=$true)][string[]]$MavenArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$javaSettings = & java -XshowSettings:properties -version 2>&1
$javaHomeSetting = $javaSettings | Select-String '^\s*java.home\s*=\s*(.+)$' | Select-Object -First 1
if ($javaHomeSetting) { $env:JAVA_HOME = $javaHomeSetting.Matches[0].Groups[1].Value.Trim() }
$mavenHome = Join-Path $projectRoot '.tools/apache-maven-3.9.11'
if (-not (Test-Path "$mavenHome/bin/mvn.cmd")) {
    New-Item -ItemType Directory -Force "$projectRoot/.tools" | Out-Null
    $archive = Join-Path $projectRoot '.tools/maven.zip'
    Invoke-WebRequest 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip' -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath "$projectRoot/.tools" -Force
}
Push-Location $projectRoot
try {
    & "$mavenHome/bin/mvn.cmd" "-Dmaven.repo.local=$projectRoot/.tools/repository" @MavenArgs
    $buildExitCode = $LASTEXITCODE
} finally { Pop-Location }
exit $buildExitCode
