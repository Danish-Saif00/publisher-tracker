& {
  $ErrorActionPreference = 'Stop'

  if (-not (Test-Path '.\package.json')) {
    throw 'Run this command from the affiliate-tracker repository root.'
  }

  if (-not (Test-Path '.\.env.example')) {
    throw '.env.example file is missing.'
  }

  if (-not (Test-Path '.\.env')) {
    Copy-Item `
      -LiteralPath '.\.env.example' `
      -Destination '.\.env' `
      -ErrorAction Stop

    Write-Host 'Created .env from .env.example.'
  }
  else {
    Write-Host 'Existing .env detected. It will be repaired without exposing secrets.'
  }

  function New-RandomBase64Key {
    $buffer =
      New-Object byte[] 32

    $generator =
      [System.Security.Cryptography.RandomNumberGenerator]::Create()

    try {
      $generator.GetBytes($buffer)
    }
    finally {
      $generator.Dispose()
    }

    return [Convert]::ToBase64String($buffer)
  }

  function Test-Base64Key32 {
    param(
      [AllowNull()]
      [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
      return $false
    }

    try {
      $decoded =
        [Convert]::FromBase64String(
          $Value.Trim()
        )

      return $decoded.Length -eq 32
    }
    catch {
      return $false
    }
  }

  function Read-EnvironmentEntries {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path
    )

    $entries =
      [ordered]@{}

    foreach (
      $line in [System.IO.File]::ReadAllLines($Path)
    ) {
      if (
        [string]::IsNullOrWhiteSpace($line) -or
        $line.TrimStart().StartsWith('#') -or
        -not $line.Contains('=')
      ) {
        continue
      }

      $separatorIndex =
        $line.IndexOf('=')

      $name =
        $line.Substring(
          0,
          $separatorIndex
        ).Trim()

      $value =
        $line.Substring(
          $separatorIndex + 1
        )

      if (
        -not [string]::IsNullOrWhiteSpace($name)
      ) {
        $entries[$name] =
          $value
      }
    }

    return $entries
  }

  function Set-EnvironmentEntries {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path,

      [Parameter(Mandatory = $true)]
      [System.Collections.IDictionary]$Values
    )

    $managedNames =
      @(
        $Values.Keys
      )

    $outputLines =
      New-Object System.Collections.Generic.List[string]

    foreach (
      $line in [System.IO.File]::ReadAllLines($Path)
    ) {
      $shouldSkip =
        $false

      if (
        -not [string]::IsNullOrWhiteSpace($line) -and
        -not $line.TrimStart().StartsWith('#') -and
        $line.Contains('=')
      ) {
        $separatorIndex =
          $line.IndexOf('=')

        $name =
          $line.Substring(
            0,
            $separatorIndex
          ).Trim()

        if ($managedNames -contains $name) {
          $shouldSkip =
            $true
        }
      }

      if (-not $shouldSkip) {
        $outputLines.Add($line)
      }
    }

    while (
      $outputLines.Count -gt 0 -and
      [string]::IsNullOrWhiteSpace(
        $outputLines[
          $outputLines.Count - 1
        ]
      )
    ) {
      $outputLines.RemoveAt(
        $outputLines.Count - 1
      )
    }

    $outputLines.Add('')

    foreach ($name in $managedNames) {
      $outputLines.Add(
        $name +
        '=' +
        [string]$Values[$name]
      )
    }

    $content =
      (
        $outputLines -join
        [Environment]::NewLine
      ) +
      [Environment]::NewLine

    [System.IO.File]::WriteAllText(
      $Path,
      $content,
      (
        New-Object System.Text.UTF8Encoding(
          $false
        )
      )
    )
  }

  $existing =
    Read-EnvironmentEntries `
      -Path '.\.env'

  $secretNames =
    @(
      'INTERNAL_SERVICE_SIGNING_SECRET',
      'DATA_ENCRYPTION_KEY',
      'IP_HASH_SECRET',
      'VISITOR_ID_SIGNING_SECRET'
    )

  $secretValues =
    [ordered]@{}

  foreach ($secretName in $secretNames) {
    $existingValue =
      if ($existing.Contains($secretName)) {
        [string]$existing[$secretName]
      }
      else {
        [string]::Empty
      }

    if (Test-Base64Key32 $existingValue) {
      $secretValues[$secretName] =
        $existingValue.Trim()
    }
    else {
      $secretValues[$secretName] =
        New-RandomBase64Key
    }
  }

  $uniqueSecretCount =
    @(
      $secretValues.Values |
        Select-Object -Unique
    ).Count

  if ($uniqueSecretCount -ne $secretNames.Count) {
    foreach ($secretName in $secretNames) {
      $secretValues[$secretName] =
        New-RandomBase64Key
    }
  }

  $values =
    [ordered]@{
      APP_ENV = 'development'
      LOG_LEVEL = 'info'
      LOG_PRETTY = 'true'
      API_HOST = '127.0.0.1'
      API_PORT = '4000'
      TRACKER_HOST = '127.0.0.1'
      TRACKER_PORT = '4100'
      CORS_ALLOWED_ORIGINS = 'http://localhost:3000'
      TRUST_PROXY = 'false'
      SWAGGER_ENABLED = 'true'
      SWAGGER_PATH = '/docs'
      OPENAPI_JSON_PATH = '/openapi.json'
      INTERNAL_SERVICE_SIGNING_SECRET = $secretValues['INTERNAL_SERVICE_SIGNING_SECRET']
      DATA_ENCRYPTION_KEY = $secretValues['DATA_ENCRYPTION_KEY']
      IP_HASH_SECRET = $secretValues['IP_HASH_SECRET']
      VISITOR_ID_SIGNING_SECRET = $secretValues['VISITOR_ID_SIGNING_SECRET']
    }

  Set-EnvironmentEntries `
    -Path '.\.env' `
    -Values $values

  $verified =
    Read-EnvironmentEntries `
      -Path '.\.env'

  foreach ($secretName in $secretNames) {
    if (
      -not $verified.Contains($secretName) -or
      -not (
        Test-Base64Key32 `
          ([string]$verified[$secretName])
      )
    ) {
      throw "Secret validation failed for $secretName."
    }
  }

  $verifiedUniqueSecretCount =
    @(
      $secretNames |
        ForEach-Object {
          [string]$verified[$_]
        } |
        Select-Object -Unique
    ).Count

  if (
    $verifiedUniqueSecretCount -ne
    $secretNames.Count
  ) {
    throw 'The four cryptographic secrets are not unique.'
  }

  git check-ignore --quiet -- '.env'

  if ($LASTEXITCODE -ne 0) {
    throw '.env is not ignored by Git.'
  }

  $remainingNames =
    @(
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SECRET_KEY',
      'DATABASE_URL_RUNTIME',
      'DATABASE_URL_MIGRATIONS',
      'REDIS_URL'
    )

  $remainingBlank =
    @(
      $remainingNames |
        Where-Object {
          -not $verified.Contains($_) -or
          [string]::IsNullOrWhiteSpace(
            [string]$verified[$_]
          )
        }
    )

  $envFile =
    Get-Item `
      -LiteralPath '.\.env'

  Write-Host ''
  Write-Host "Validated: $($envFile.FullName)"
  Write-Host "Size: $($envFile.Length) bytes"
  Write-Host 'Four separate 32-byte Base64 secrets are present and valid.'
  Write-Host '.env is ignored by Git.'

  if ($remainingBlank.Count -gt 0) {
    Write-Host ''
    Write-Host 'External infrastructure values still pending:'

    foreach ($name in $remainingBlank) {
      Write-Host "  $name"
    }
  }

  Write-Host ''
  Write-Host 'PRODUCTION SETUP STEP 2 ENVIRONMENT FILE REPAIRED AND VALIDATED'
}
