# trust-ca.ps1 - install Caddy's internal CA on Windows (Win / Docker).
# Mirrors trust-ca.sh but targets the Windows trust stores and env vars:
#   * CurrentUser\Root  -> browsers / Electron that use Schannel (no admin needed).
#   * LocalMachine\Root -> system-wide / service-launched clients (needs admin;
#                          auto-elevated via UAC when available).
#   * NODE_EXTRA_CA_CERTS (User + Machine) -> Node.js / Electron MCP clients
#                          (CodeBuddy / VSCode / Codex), which ignore the OS store.
#   * SSL_CERT_FILE (User + Machine) -> curl.exe / Python / OpenSSL-based clients.

. "$PSScriptRoot\lib.ps1"
Detect-Compose

$CA_FILE = $CA_CERT
if (-not (Test-Path $CA_FILE)) {
  Write-Error (@"
Caddy CA not found at $CA_FILE
Start the stack first so Caddy can generate its internal CA:
  .\up.ps1
"@)
  exit 1
}
$absCa = (Resolve-Path $CA_FILE).Path

# 1) Windows certificate stores (Root).
function Add-CaToStore([string]$StoreName) {
  $store = $null
  try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($absCa)
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', $StoreName)
    $store.Open('ReadWrite')
    $exists = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    if (-not $exists) {
      $store.Add($cert)
      Write-Host "    added to $StoreName\Root (thumbprint $($cert.Thumbprint))"
    } else {
      Write-Host "    already present in $StoreName\Root"
    }
  } catch {
    Write-Warning "Could not write to $StoreName\Root : $_"
  } finally {
    if ($store) { $store.Close() }
  }
}

Write-Host '==> Installing Caddy CA into the Trusted Root stores'
Add-CaToStore 'CurrentUser'
if (Test-Admin) {
  Add-CaToStore 'LocalMachine'
} else {
  $storeScript = @"
`$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('$absCa')
`$s = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
`$s.Open('ReadWrite')
if (-not (`$s.Certificates | Where-Object { `$_.Thumbprint -eq `$c.Thumbprint })) { `$s.Add(`$c) }
`$s.Close()
"@
  if (Invoke-Elevated $storeScript) {
    Write-Host '    added to LocalMachine\Root (elevated)'
  } else {
    Write-Warning '    LocalMachine\Root skipped (elevation denied) — CurrentUser only is set'
  }
}

# 2) Node / Electron / OpenSSL-based clients ignore the OS store, so point them at
#    the CA file via env vars. User covers this user's processes; Machine covers
#    GUI-launched clients (the Explorer process tree) that would NOT inherit a User
#    env change without a full logoff. Machine is auto-elevated when available.
Write-Host '==> Setting NODE_EXTRA_CA_CERTS / SSL_CERT_FILE'
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $absCa, 'User')
[Environment]::SetEnvironmentVariable('SSL_CERT_FILE', $absCa, 'User')
$env:NODE_EXTRA_CA_CERTS = $absCa
$env:SSL_CERT_FILE = $absCa
if (Test-Admin) {
  [Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $absCa, 'Machine')
  [Environment]::SetEnvironmentVariable('SSL_CERT_FILE', $absCa, 'Machine')
  Write-Host '    (also set in the Machine environment)'
} else {
  $envScript = @"
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', '$absCa', 'Machine')
[Environment]::SetEnvironmentVariable('SSL_CERT_FILE', '$absCa', 'Machine')
"@
  if (Invoke-Elevated $envScript) {
    Write-Host '    (also set in the Machine environment, elevated)'
  } else {
    Write-Host '    (Machine environment skipped — User env is set; restart the client)'
  }
}

Write-Host ''
Write-Host 'Done. Restart your browsers and Electron MCP clients (CodeBuddy / VSCode / Codex).'
Write-Host 'Each deployment directory generates its OWN CA; moving the checkout'
Write-Host 'changes it, so re-run this script after relocating the stack.'

# 3) Optional sanity probe: prove a TLS fetch against Penpot works from Node in
#    THIS session (we just exported NODE_EXTRA_CA_CERTS here). The MCP client is a
#    separate process and must be restarted to inherit the new env var.
Write-Host ''
Write-Host '==> Verifying Node.js can reach https://penpot.local in this session'
if (Get-Command node -ErrorAction SilentlyContinue) {
  $probe = "Promise.race([fetch('https://${HOST_NAME}/api/main/methods/get-enabled-flags').then(r => process.exit(r.status === 401 ? 0 : 1)), new Promise(r => setTimeout(() => process.exit(3), 10000))]).catch(e => process.exit(2))"
  & node -e $probe 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host '    Sanity check OK: Node.js fetch against https://penpot.local succeeds.'
  } else {
    Write-Warning "    Node cannot reach https://penpot.local yet. If the stack is up, restart your"
    Write-Warning "    MCP client (CodeBuddy / VSCode / Codex) so it inherits NODE_EXTRA_CA_CERTS."
  }
} else {
  Write-Host '    (node not found — skipping Node sanity check; the CA is still installed)'
}
