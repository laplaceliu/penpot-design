# install.ps1 - one-shot first-time setup for Windows / Docker.
# Runs the full sequence: prewarm -> up -> trust-ca -> create-profile.
# After it finishes, open https://penpot.local/ and log in.
#
# Pass-through params for the admin account are forwarded to create-profile.ps1.
# If -Password is omitted, create-profile.ps1 will prompt interactively.

[CmdletBinding()]
param(
  [string]$Email,
  [string]$Password,
  [string]$Fullname,
  [switch]$NoPrewarm,
  [switch]$Help
)

if ($Help) {
  Write-Host @'
Usage: .\install.ps1 [-Email <email>] [-Password <pw>] [-Fullname <name>]
                    [-NoPrewarm] [-Help]

  Runs (in order): prewarm.ps1, up.ps1, trust-ca.ps1, create-profile.ps1.
  -NoPrewarm  skip pulling images (use if you already have them cached)
'@
  exit 0
}

$root = $PSScriptRoot
$cpArgs = @()
if ($Email)    { $cpArgs += @('-Email', $Email) }
if ($Password) { $cpArgs += @('-Password', $Password) }
if ($Fullname) { $cpArgs += @('-Fullname', $Fullname) }

if (-not $NoPrewarm) {
  Write-Host '===== [1/4] Pre-pulling images ====='
  & "$root\prewarm.ps1"
  if ($LASTEXITCODE -ne 0) { Write-Error 'prewarm failed.'; exit 1 }
}

Write-Host ''
Write-Host '===== [2/4] Starting the stack ====='
& "$root\up.ps1"
if ($LASTEXITCODE -ne 0) { Write-Error 'up failed.'; exit 1 }

Write-Host ''
Write-Host '===== [3/4] Trusting Caddy CA (browsers + Node MCP clients) ====='
& "$root\trust-ca.ps1"
if ($LASTEXITCODE -ne 0) { Write-Error 'trust-ca failed.'; exit 1 }

Write-Host ''
Write-Host '===== [4/4] Creating the admin account ====='
& "$root\create-profile.ps1" @cpArgs
if ($LASTEXITCODE -ne 0) { Write-Error 'create-profile failed.'; exit 1 }

Write-Host ''
Write-Host '=========================================================='
Write-Host 'Penpot is installed and running.'
Write-Host '  URL:        https://penpot.local/'
Write-Host '  MCP stream: https://penpot.local/mcp/stream'
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  * Open the URL in your browser and log in.'
Write-Host '  * Restart your AI client (CodeBuddy / VSCode / Codex) so it picks up'
Write-Host '    the NODE_EXTRA_CA_CERTS env var, then add the MCP server URL above'
Write-Host '    to .mcp.json (see references/mcp-connection.md).'
Write-Host '=========================================================='
