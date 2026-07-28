& {
  Set-StrictMode -Version Latest
  $ErrorActionPreference = "Stop"

  function Read-DotEnv {
    param([string]$Path)
    $values = @{}
    foreach ($rawLine in [System.IO.File]::ReadAllLines($Path)) {
      $line = $rawLine.Trim()
      if ($line.Length -eq 0 -or $line.StartsWith("#")) { continue }
      if ($line.StartsWith("export ")) { $line = $line.Substring(7).TrimStart() }
      $separatorIndex = $line.IndexOf("=")
      if ($separatorIndex -lt 1) { continue }
      $name = $line.Substring(0, $separatorIndex).Trim()
      $value = $line.Substring($separatorIndex + 1).Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if ($name.Length -gt 0) { $values[$name] = $value }
    }
    return $values
  }

  $envPath = 'C:\Users\Hameed Computer\Desktop\affiliate-tracker\.env'
  $sessionStartUtc = '2026-07-26T12:55:42.729Z'
  $values = Read-DotEnv -Path $envPath
  $supabaseUrl = ([string]$values["SUPABASE_URL"]).TrimEnd("/")
  $secretKey = [string]$values["SUPABASE_SECRET_KEY"]

  $headers = @{
    apikey = $secretKey
    Accept = "application/json"
  }

  if (-not $secretKey.StartsWith("sb_secret_", [System.StringComparison]::Ordinal)) {
    $headers.Authorization = "Bearer $secretKey"
  }

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $encodedStart = [Uri]::EscapeDataString("gte.$sessionStartUtc")
  $lastSignature = ""

  Write-Host ""
  Write-Host "CONTROLLED INVITATION E2E MONITOR" -ForegroundColor Green
  Write-Host "Only sanitized status fields are displayed." -ForegroundColor DarkGray
  Write-Host "Press Ctrl+C to stop this monitor." -ForegroundColor DarkGray
  Write-Host ""

  while ($true) {
    try {
      $notificationUrl =
        $supabaseUrl +
        "/rest/v1/email_notifications" +
        "?select=id,invitation_id,status,attempt_count,max_attempts,created_at,queued_at,processing_started_at,sent_at,failed_at,cancelled_at,last_error_code,provider_message_id" +
        "&created_at=$encodedStart" +
        "&order=created_at.desc" +
        "&limit=1"

      $notifications =
        Invoke-RestMethod 
          -Method Get 
          -Uri $notificationUrl 
          -Headers $headers 
          -UserAgent "affiliate-tracker-e2e-monitor/1.0" 
          -TimeoutSec 15

      $notification = @($notifications) | Select-Object -First 1

      if ($null -eq $notification) {
        $signature = "waiting"

        if ($signature -ne $lastSignature) {
          Write-Host "Waiting for a new invitation notification..." -ForegroundColor Yellow
          $lastSignature = $signature
        }
      }
      else {
        $invitation = $null
        $membership = $null

        if (-not [string]::IsNullOrWhiteSpace([string]$notification.invitation_id)) {
          $invitationIdFilter =
            [Uri]::EscapeDataString(
              "eq.$($notification.invitation_id)"
            )

          $invitationUrl =
            $supabaseUrl +
            "/rest/v1/company_invitations" +
            "?select=id,company_id,user_id,role,status,delivery_status,expires_at,accepted_at,revoked_at,last_sent_at,send_count,last_delivery_error_code" +
            "&id=$invitationIdFilter" +
            "&limit=1"

          $invitations =
            Invoke-RestMethod 
              -Method Get 
              -Uri $invitationUrl 
              -Headers $headers 
              -UserAgent "affiliate-tracker-e2e-monitor/1.0" 
              -TimeoutSec 15

          $invitation = @($invitations) | Select-Object -First 1

          if (
            $null -ne $invitation -and
            -not [string]::IsNullOrWhiteSpace([string]$invitation.user_id)
          ) {
            $companyFilter =
              [Uri]::EscapeDataString(
                "eq.$($invitation.company_id)"
              )

            $userFilter =
              [Uri]::EscapeDataString(
                "eq.$($invitation.user_id)"
              )

            $membershipUrl =
              $supabaseUrl +
              "/rest/v1/company_memberships" +
              "?select=company_id,user_id,role,status,joined_at" +
              "&company_id=$companyFilter" +
              "&user_id=$userFilter" +
              "&limit=1"

            $memberships =
              Invoke-RestMethod 
                -Method Get 
                -Uri $membershipUrl 
                -Headers $headers 
                -UserAgent "affiliate-tracker-e2e-monitor/1.0" 
                -TimeoutSec 15

            $membership = @($memberships) | Select-Object -First 1
          }
        }

        $signature =
          @(
            $notification.status
            $notification.attempt_count
            $notification.sent_at
            $notification.failed_at
            if ($null -ne $invitation) { $invitation.status } else { "" }
            if ($null -ne $invitation) { $invitation.delivery_status } else { "" }
            if ($null -ne $membership) { $membership.status } else { "" }
          ) -join "|"

        if ($signature -ne $lastSignature) {
          Write-Host ""
          Write-Host "Outbox status: $($notification.status)" -ForegroundColor Cyan
          Write-Host "Attempts: $($notification.attempt_count)/$($notification.max_attempts)"
          Write-Host "Provider accepted: $(-not [string]::IsNullOrWhiteSpace([string]$notification.provider_message_id))"

          if (-not [string]::IsNullOrWhiteSpace([string]$notification.last_error_code)) {
            Write-Host "Outbox error code: $($notification.last_error_code)" -ForegroundColor Red
          }

          if ($null -ne $invitation) {
            Write-Host "Invitation status: $($invitation.status)"
            Write-Host "Invitation delivery: $($invitation.delivery_status)"
            Write-Host "Assigned role: $($invitation.role)"
            Write-Host "Send count: $($invitation.send_count)"
            Write-Host "Expires at: $($invitation.expires_at)"

            if (-not [string]::IsNullOrWhiteSpace([string]$invitation.last_delivery_error_code)) {
              Write-Host "Invitation error code: $($invitation.last_delivery_error_code)" -ForegroundColor Red
            }
          }

          if ($null -ne $membership) {
            Write-Host "Membership status: $($membership.status)" -ForegroundColor Green
            Write-Host "Membership role: $($membership.role)"
            Write-Host "Joined at: $($membership.joined_at)"
          }

          if (
            $notification.status -eq "sent" -and
            $null -ne $invitation -and
            $invitation.status -eq "pending"
          ) {
            Write-Host "Email provider accepted the invitation. Check the test inbox." -ForegroundColor Green
          }

          if (
            $null -ne $invitation -and
            $invitation.status -eq "accepted" -and
            $null -ne $membership -and
            $membership.status -eq "active"
          ) {
            Write-Host ""
            Write-Host "LIVE INVITATION E2E ACCEPTANCE PASSED" -ForegroundColor Green
          }

          $lastSignature = $signature
        }
      }
    }
    catch {
      Write-Host "Monitor query failed safely; retrying. No secrets printed." -ForegroundColor DarkYellow
    }

    Start-Sleep -Seconds 2
  }
}