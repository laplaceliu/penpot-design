# down.ps1 - bring the stack down (Win / Docker). Preserves data by default;
# pass -Volumes to also delete named volumes (irreversible). Mirrors down.sh.

[CmdletBinding()]
param(
  [switch]$Volumes,
  [switch]$Help
)

if ($Help) {
  Write-Host @'
Usage: .\down.ps1 [-Volumes] [-Help]
  (no flag)   stop containers, keep all data in ./data
  -Volumes    stop containers AND delete named volumes (irreversible)
'@
  exit 0
}

. "$PSScriptRoot\lib.ps1"
Detect-Compose
Require-ComposeFile

if ($Volumes) {
  Write-Host '==> Stopping services and removing volumes'
  Compose down -v --remove-orphans
  Write-Host '==> Pruning dangling images'
  & $global:COMPOSE_CMD[0] image prune -f
} else {
  Write-Host '==> Stopping services (data in ./data preserved)'
  Compose down --remove-orphans
}
