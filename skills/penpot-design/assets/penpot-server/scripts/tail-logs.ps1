# tail-logs.ps1 - follow a single service's logs (Win / Docker). Mirrors
# tail-logs.sh. Usage: .\tail-logs.ps1 [service]   (default: penpot-backend)

. "$PSScriptRoot\lib.ps1"
Detect-Compose
Require-ComposeFile

$service = if ($args.Count -gt 0) { $args[0] } else { 'penpot-backend' }

if ($service -in @('--help', '-h')) {
  Write-Host 'Usage: .\tail-logs.ps1 [service]'
  Write-Host ''
  Write-Host 'Available services:'
  Compose-Raw -f $COMPOSE_FILE config --services 2>$null | ForEach-Object { "  $_" }
  exit 0
}

# Validate the service name against the compose file (avoid a deep, unhelpful error).
$known = Compose-Raw -f $COMPOSE_FILE config --services 2>$null
if ($known -notcontains $service) {
  Write-Error "ERROR: unknown service '$service'. Available services:"
  $known | ForEach-Object { "  $_" }
  exit 1
}

Compose-Raw -f $COMPOSE_FILE logs --tail 100 -f $service
