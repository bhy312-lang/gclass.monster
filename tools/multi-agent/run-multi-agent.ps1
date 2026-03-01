param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Request,

  [string]$Context = "",
  [string]$OutDir = "tools/multi-agent/output",
  [switch]$Write
)

$scriptPath = Join-Path $PSScriptRoot "orchestrator.cjs"

if (!(Test-Path $scriptPath)) {
  Write-Error "orchestrator.cjs not found: $scriptPath"
  exit 1
}

$args = @($scriptPath)

if ($Context -and $Context.Trim().Length -gt 0) {
  $args += "--context"
  $args += $Context
}

if ($Write.IsPresent) {
  $args += "--write"
  $args += "--out-dir"
  $args += $OutDir
}

$args += $Request

node @args
