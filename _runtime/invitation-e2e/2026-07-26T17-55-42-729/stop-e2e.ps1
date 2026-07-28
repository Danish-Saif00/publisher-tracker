& {
  Set-StrictMode -Version Latest
  $ErrorActionPreference = "Stop"

  $sessionPath = 'C:\Users\Hameed Computer\Desktop\affiliate-tracker\_runtime\invitation-e2e\2026-07-26T17-55-42-729\session.json'

  if (-not (Test-Path -LiteralPath $sessionPath -PathType Leaf)) {
    throw "E2E session file nahi mili."
  }

  $session = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json

  foreach ($propertyName in @("monitor_pid", "frontend_pid", "worker_pid", "api_pid")) {
    $pidValue = $session.$propertyName

    if ($null -eq $pidValue) {
      continue
    }

    try {
      & taskkill.exe /PID ([int]$pidValue) /T /F 2>$null | Out-Null
    }
    catch {
      # Already stopped.
    }
  }

  Write-Host "CONTROLLED INVITATION E2E SERVICES STOPPED" -ForegroundColor Green
}