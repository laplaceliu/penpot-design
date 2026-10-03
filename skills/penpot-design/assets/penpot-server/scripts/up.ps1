# up.ps1 - bring the stack up and wait for Caddy HTTPS to be ready (Win/Docker).
# Mirrors up.sh. The probe is HTTPS because Penpot 2.17 requires a secure origin.

. "$PSScriptRoot\lib.ps1"
Detect-Compose
Require-ComposeFile
Assert-EngineReady

# Best-effort: add the hosts entry if we are elevated; otherwise print a hint.
Add-HostEntry $HOST_NAME 127.0.0.1 | Out-Null
New-DataDirs

Write-Host '==> Starting services (run .\prewarm.ps1 first on a fresh host)'
Compose up -d --no-build --remove-orphans

Write-Host ''
Write-Host "Waiting for Caddy to terminate TLS at https://$HOST_NAME ..."

$attempts = 60
while ($attempts -gt 0) {
  $c1 = Invoke-Probe '/api/main/methods/get-enabled-flags'
  $c2 = Invoke-Probe '/'
  if ($c1 -eq '200' -or $c2 -eq '200') { break }
  $attempts--
  if ($attempts -le 0) {
    Write-Error (@"
ERROR: Caddy did not respond on https://$HOST_NAME within ~120s.
  .\tail-logs.ps1 penpot-caddy
  .\tail-logs.ps1 penpot-frontend
"@)
    exit 1
  }
  Start-Sleep -Seconds 2
}

Write-Host ''
Write-Host 'Penpot is up.'
Write-Host "  URL:        https://$HOST_NAME/"
Write-Host "  MCP stream: https://$HOST_NAME/mcp/stream"
Write-Host ''
Write-Host '  A fresh database has NO login yet. Create one with:'
Write-Host '    .\create-profile.ps1'
Write-Host '  (defaults to admin@penpot.local, prompts for the password)'
Write-Host ''
Write-Host 'First-time trust note:'
Write-Host '  The leaf cert is signed by Caddy''s internal CA. To dismiss the'
Write-Host '  browser warning and let Node/Electron MCP clients verify it, run:'
Write-Host '    .\trust-ca.ps1'
Write-Host '  Then restart your browsers and AI client.'
Write-Host ''
Write-Host '  (Change the password under /auth/profile once logged in.)'
