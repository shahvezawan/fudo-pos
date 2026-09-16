param([Parameter(Mandatory=$true)][string]$ProjectPath,[Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$resolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
$resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
$runner = Join-Path $resolvedProject 'scripts\start-server.ps1'
if (!(Test-Path -LiteralPath $runner)) { throw 'Start script not found.' }
if (!(Test-Path -LiteralPath (Join-Path $resolvedProject 'dist\index.html'))) { throw 'Build FUDO before registering startup.' }
if ($resolvedProject.Contains('"') -or $resolvedNode.Contains('"')) { throw 'Paths must not contain quote characters.' }
$credentials = Get-Credential -Message 'Windows account that will run FUDO and access its backup destination'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "{0}" -ProjectPath "{1}" -NodePath "{2}"' -f $runner, $resolvedProject, $resolvedNode
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $resolvedProject
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'FUDO Restaurant Server' -Action $action -Trigger $trigger -Settings $settings -User $credentials.UserName -Password $credentials.GetNetworkCredential().Password -Description 'Local FUDO restaurant POS server' | Out-Null
Start-ScheduledTask -TaskName 'FUDO Restaurant Server'
Write-Output 'FUDO startup task registered and started. Check logs\server.log and perform a reboot rehearsal.'
