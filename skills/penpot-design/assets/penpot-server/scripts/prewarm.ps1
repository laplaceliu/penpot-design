# prewarm.ps1 - pre-pull every image the stack needs (Windows / Docker).
# Shortens the time-to-ready on the first `up.ps1` so the postgres migration
# step does not look like a hang.
#
# Why re-exec guard like the .sh scripts: PowerShell scripts are invoked
# directly, so no re-exec is needed; we just source lib.ps1.

. "$PSScriptRoot\lib.ps1"
Detect-Compose
Require-ComposeFile

$tag = if ($env:PENPOT_IMAGE_TAG) { $env:PENPOT_IMAGE_TAG } else { '2.18' }

$images = @(
  'postgres:15-alpine',
  'valkey/valkey:7-alpine',
  'caddy:2-alpine',
  "penpotapp/frontend:$tag",
  "penpotapp/backend:$tag",
  "penpotapp/exporter:$tag",
  "penpotapp/mcp:$tag"
)

$binary = $global:COMPOSE_CMD[0]
Write-Host "Pre-pulling $($images.Count) images (engine=$global:COMPOSE_ENGINE, tag=$tag)..."

$failed = 0
foreach ($img in $images) {
  Write-Host "==> $binary pull $img"
  # One unreachable registry should not abort the whole warm-up.
  # Note: capture the output (not pipe to Out-Null) so $LASTEXITCODE reflects the
  # native pull exit code, not Out-Null's.
  $pullOut = & $binary pull --quiet $img 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "failed to pull $img"
    $failed = 1
  }
}

Write-Host ''
if ($failed -eq 0) {
  Write-Host 'All images cached locally.'
} else {
  Write-Wost 'Some images could not be pulled - see the warnings above.'
}
Write-Host 'Next: .\up.ps1'
exit $failed
