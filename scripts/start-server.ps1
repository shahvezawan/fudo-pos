param([Parameter(Mandatory=$true)][string]$ProjectPath,[Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$resolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
$resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
Set-Location -LiteralPath $resolvedProject
$logPath = Join-Path $resolvedProject 'logs'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$env:NODE_ENV = 'production'
while ($true) {
    & $resolvedNode --import tsx server/index.ts *>> (Join-Path $logPath 'server.log')
    Start-Sleep -Seconds 10
}
