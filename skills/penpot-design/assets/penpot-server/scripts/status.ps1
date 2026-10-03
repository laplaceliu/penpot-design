# status.ps1 - one-shot status probe (Win / Docker): container state + HTTPS
# health + certificate + disk usage. Mirrors status.sh.

. "$PSScriptRoot\lib.ps1"
Detect-Compose
Require-ComposeFile

Write-Host '==> Deployment'
Write-Host "  compose file: $COMPOSE_FILE"
Write-Host "  data dir:     $DATA_DIR"
Write-Host "  host name:    $HOST_NAME"

Write-Host ''
Write-Host '==> Container status'
Compose-Raw -f $COMPOSE_FILE ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
if ($LASTEXITCODE -ne 0) {
  # Older compose variants without --format support: fall back to plain ps.
  Compose-Raw -f $COMPOSE_FILE ps
}

Write-Host ''
Write-Host '==> HTTPS probes'
foreach ($path in @('/', '/api/main/methods/get-enabled-flags')) {
  $url = "https://$HOST_NAME$path"
  $code = Invoke-Probe $path
  Write-Host "  $url -> $code"
}

Write-Host ''
Write-Host '==> Certificate'
if (Test-CaPresent) {
  Write-Host "  CA cert: $CA_CERT"
  # openssl may not exist on Windows; try, ignore if missing.
  $openssl = Get-Command openssl -ErrorAction SilentlyContinue
  if ($openssl) {
    & openssl x509 -in $CA_CERT -noout -subject -dates 2>$null | ForEach-Object { "  $_" }
  } else {
    try {
      $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path $CA_CERT).Path)
      Write-Host "  Subject: $($c.Subject)"
      Write-Host "  NotBefore: $($c.NotBefore)  NotAfter: $($c.NotAfter)"
    } catch {}
  }
} else {
  Write-Host '  CA cert not generated yet (start the stack with .\up.ps1)'
}

Write-Host ''
Write-Host '==> Disk usage (data dir)'
if (Test-Path $DATA_DIR) {
  Get-ChildItem $DATA_DIR | ForEach-Object {
    $sz = '{0:N2} MB' -f ((Get-ChildItem $_.FullName -Recurse -ErrorAction SilentlyContinue |
                           Measure-Object -Property Length -Sum).Sum / 1MB)
    Write-Host "  $($_.Name.PadRight(14)) $sz"
  }
} else {
  Write-Host '  (empty)'
}
