& {
  $ErrorActionPreference = 'Stop'

  function Assert-NativeCommand {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Step
    )

    if ($LASTEXITCODE -ne 0) {
      throw "$Step failed with exit code $LASTEXITCODE."
    }
  }

  function Write-Base64File {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path,

      [Parameter(Mandatory = $true)]
      [string]$Base64Content
    )

    $absolutePath = Join-Path `
      (Get-Location) `
      $Path

    $directory = Split-Path `
      $absolutePath `
      -Parent

    if (-not (Test-Path $directory)) {
      New-Item `
        -ItemType Directory `
        -Path $directory `
        -Force |
        Out-Null
    }

    [System.IO.File]::WriteAllBytes(
      $absolutePath,
      [System.Convert]::FromBase64String(
        $Base64Content.Trim()
      )
    )
  }

  if (-not (Test-Path '.\package.json')) {
    throw 'Run this command from the affiliate-tracker repository root.'
  }

  $nodeDirectory = Join-Path `
    (Get-Location) `
    '.tools\node-v24.18.0-win-x64'

  $nodeExecutable = Join-Path `
    $nodeDirectory `
    'node.exe'

  if (-not (Test-Path $nodeExecutable)) {
    throw "Local Node v24.18.0 is missing: $nodeExecutable"
  }

  $env:Path =
    $nodeDirectory +
    [System.IO.Path]::PathSeparator +
    $env:Path

  $activeNodeVersion = (
    node --version
  ).Trim()

  Assert-NativeCommand 'Node version check'

  $activePnpmVersion = (
    pnpm --version
  ).Trim()

  Assert-NativeCommand 'pnpm version check'

  if ($activeNodeVersion -ne 'v24.18.0') {
    throw "Expected Node v24.18.0, but active version is $activeNodeVersion."
  }

  if ($activePnpmVersion -ne '11.15.1') {
    throw "Expected pnpm 11.15.1, but active version is $activePnpmVersion."
  }

  Write-Host "Active Node.js: $activeNodeVersion"
  Write-Host "Active pnpm: $activePnpmVersion"

  Write-Host ''
  Write-Host 'Writing root environment loader and one-time Platform Super Admin bootstrap migration.'

  Write-Base64File `
    -Path 'packages/config/src/load-root-environment.ts' `
    -Base64Content @'
aW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gJ25vZGU6ZnMnOwppbXBvcnQgeyBkaXJuYW1lLCByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJzsKaW1wb3J0IHByb2Nlc3MgZnJvbSAnbm9kZTpwcm9jZXNzJzsKCmNvbnN0IFdPUktTUEFDRV9NQVJLRVJfRklMRSA9ICdwbnBtLXdvcmtzcGFjZS55YW1sJzsKY29uc3QgUEFDS0FHRV9NQVJLRVJfRklMRSA9ICdwYWNrYWdlLmpzb24nOwpjb25zdCBERUZBVUxUX0VOVl9GSUxFX05BTUUgPSAnLmVudic7CgpleHBvcnQgaW50ZXJmYWNlIExvYWRSb290RW52aXJvbm1lbnRGaWxlT3B0aW9ucyB7CiAgcmVhZG9ubHkgc3RhcnREaXJlY3Rvcnk/OiBzdHJpbmc7CiAgcmVhZG9ubHkgZmlsZU5hbWU/OiBzdHJpbmc7Cn0KCmZ1bmN0aW9uIGZpbmRXb3Jrc3BhY2VSb290KHN0YXJ0RGlyZWN0b3J5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgewogIGNvbnN0IGN1cnJlbnREaXJlY3RvcnkgPSByZXNvbHZlKHN0YXJ0RGlyZWN0b3J5KTsKICBjb25zdCB3b3Jrc3BhY2VNYXJrZXJQYXRoID0gcmVzb2x2ZShjdXJyZW50RGlyZWN0b3J5LCBXT1JLU1BBQ0VfTUFSS0VSX0ZJTEUpOwogIGNvbnN0IHBhY2thZ2VNYXJrZXJQYXRoID0gcmVzb2x2ZShjdXJyZW50RGlyZWN0b3J5LCBQQUNLQUdFX01BUktFUl9GSUxFKTsKCiAgaWYgKGV4aXN0c1N5bmMod29ya3NwYWNlTWFya2VyUGF0aCkgJiYgZXhpc3RzU3luYyhwYWNrYWdlTWFya2VyUGF0aCkpIHsKICAgIHJldHVybiBjdXJyZW50RGlyZWN0b3J5OwogIH0KCiAgY29uc3QgcGFyZW50RGlyZWN0b3J5ID0gZGlybmFtZShjdXJyZW50RGlyZWN0b3J5KTsKCiAgcmV0dXJuIHBhcmVudERpcmVjdG9yeSA9PT0gY3VycmVudERpcmVjdG9yeQogICAgPyB1bmRlZmluZWQKICAgIDogZmluZFdvcmtzcGFjZVJvb3QocGFyZW50RGlyZWN0b3J5KTsKfQoKZXhwb3J0IGZ1bmN0aW9uIGxvYWRSb290RW52aXJvbm1lbnRGaWxlKAogIG9wdGlvbnM6IExvYWRSb290RW52aXJvbm1lbnRGaWxlT3B0aW9ucyA9IHt9LAopOiBzdHJpbmcgfCB1bmRlZmluZWQgewogIGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBmaW5kV29ya3NwYWNlUm9vdChvcHRpb25zLnN0YXJ0RGlyZWN0b3J5ID8/IHByb2Nlc3MuY3dkKCkpOwoKICBpZiAod29ya3NwYWNlUm9vdCA9PT0gdW5kZWZpbmVkKSB7CiAgICByZXR1cm4gdW5kZWZpbmVkOwogIH0KCiAgY29uc3QgZW52aXJvbm1lbnRQYXRoID0gcmVzb2x2ZSgKICAgIHdvcmtzcGFjZVJvb3QsCiAgICBvcHRpb25zLmZpbGVOYW1lID8/IERFRkFVTFRfRU5WX0ZJTEVfTkFNRSwKICApOwoKICBpZiAoIWV4aXN0c1N5bmMoZW52aXJvbm1lbnRQYXRoKSkgewogICAgcmV0dXJuIHVuZGVmaW5lZDsKICB9CgogIHByb2Nlc3MubG9hZEVudkZpbGUoZW52aXJvbm1lbnRQYXRoKTsKCiAgcmV0dXJuIGVudmlyb25tZW50UGF0aDsKfQo=
'@

  Write-Base64File `
    -Path 'supabase/migrations/20260723063000_add_platform_super_admin_bootstrap.sql' `
    -Base64Content @'
YmVnaW47CgpjcmVhdGUgb3IgcmVwbGFjZSBmdW5jdGlvbiBwcml2YXRlLmVuZm9yY2VfdXNlcl9wcm9maWxlX3VwZGF0ZV9ydWxlcygpCnJldHVybnMgdHJpZ2dlcgpsYW5ndWFnZSBwbHBnc3FsCnNlY3VyaXR5IGRlZmluZXIKc2V0IHNlYXJjaF9wYXRoID0gcGdfY2F0YWxvZwphcyAkZnVuY3Rpb24kCmRlY2xhcmUKICBib290c3RyYXBfcm9sZV9hc3NpZ25tZW50IGJvb2xlYW47CmJlZ2luCiAgYm9vdHN0cmFwX3JvbGVfYXNzaWdubWVudCA6PQogICAgb2xkLnBsYXRmb3JtX3JvbGUgaXMgbnVsbAogICAgYW5kIG5ldy5wbGF0Zm9ybV9yb2xlID0gJ3BsYXRmb3JtX3N1cGVyX2FkbWluJwogICAgYW5kIGN1cnJlbnRfc2V0dGluZygKICAgICAgJ2FwcC5ib290c3RyYXBfcGxhdGZvcm1fc3VwZXJfYWRtaW4nLAogICAgICB0cnVlCiAgICApID0gJ3RydWUnCiAgICBhbmQgbm90IGV4aXN0cyAoCiAgICAgIHNlbGVjdCAxCiAgICAgIGZyb20gcHVibGljLnVzZXJfcHJvZmlsZXMgYXMgZXhpc3RpbmdfcHJvZmlsZQogICAgICB3aGVyZSBleGlzdGluZ19wcm9maWxlLnBsYXRmb3JtX3JvbGUgPSAncGxhdGZvcm1fc3VwZXJfYWRtaW4nCiAgICAgICAgYW5kIGV4aXN0aW5nX3Byb2ZpbGUudXNlcl9pZCA8PiBuZXcudXNlcl9pZAogICAgKTsKCiAgaWYgbmV3LnVzZXJfaWQgaXMgZGlzdGluY3QgZnJvbSBvbGQudXNlcl9pZAogICAgb3IgbmV3LmNyZWF0ZWRfYXQgaXMgZGlzdGluY3QgZnJvbSBvbGQuY3JlYXRlZF9hdAogIHRoZW4KICAgIHJhaXNlIGV4Y2VwdGlvbgogICAgICB1c2luZwogICAgICAgIGVycmNvZGUgPSAnNDI1MDEnLAogICAgICAgIG1lc3NhZ2UgPSAnVXNlciBpZGVudGl0eSBhbmQgY3JlYXRpb24gZmllbGRzIGFyZSBpbW11dGFibGUuJzsKICBlbmQgaWY7CgogIGlmIG5ldy5wbGF0Zm9ybV9yb2xlIGlzIGRpc3RpbmN0IGZyb20gb2xkLnBsYXRmb3JtX3JvbGUKICAgIGFuZCBub3QgYm9vdHN0cmFwX3JvbGVfYXNzaWdubWVudAogIHRoZW4KICAgIHJhaXNlIGV4Y2VwdGlvbgogICAgICB1c2luZwogICAgICAgIGVycmNvZGUgPSAnNDI1MDEnLAogICAgICAgIG1lc3NhZ2UgPSAnQSBwbGF0Zm9ybSByb2xlIGNhbm5vdCBiZSBjaGFuZ2VkIG91dHNpZGUgdGhlIG9uZS10aW1lIGJvb3RzdHJhcCBmbG93Lic7CiAgZW5kIGlmOwoKICBpZiBuZXcuc3RhdHVzIGlzIGRpc3RpbmN0IGZyb20gb2xkLnN0YXR1cwogICAgYW5kIG5vdCBib290c3RyYXBfcm9sZV9hc3NpZ25tZW50CiAgdGhlbgogICAgaWYgbm90IHByaXZhdGUuaXNfcGxhdGZvcm1fc3VwZXJfYWRtaW4oKSB0aGVuCiAgICAgIHJhaXNlIGV4Y2VwdGlvbgogICAgICAgIHVzaW5nCiAgICAgICAgICBlcnJjb2RlID0gJzQyNTAxJywKICAgICAgICAgIG1lc3NhZ2UgPSAnT25seSBhIFBsYXRmb3JtIFN1cGVyIEFkbWluIGNhbiBjaGFuZ2UgdXNlciBzdGF0dXMuJzsKICAgIGVuZCBpZjsKCiAgICBpZiBuZXcudXNlcl9pZCA9IHByaXZhdGUuY3VycmVudF9hY3Rvcl91c2VyX2lkKCkKICAgICAgYW5kIG5ldy5zdGF0dXMgPSAnc3VzcGVuZGVkJwogICAgdGhlbgogICAgICByYWlzZSBleGNlcHRpb24KICAgICAgICB1c2luZwogICAgICAgICAgZXJyY29kZSA9ICcyMzUxNCcsCiAgICAgICAgICBtZXNzYWdlID0gJ0EgUGxhdGZvcm0gU3VwZXIgQWRtaW4gY2Fubm90IHN1c3BlbmQgdGhlaXIgb3duIGFjY291bnQuJzsKICAgIGVuZCBpZjsKICBlbmQgaWY7CgogIHJldHVybiBuZXc7CmVuZDsKJGZ1bmN0aW9uJDsKCmNyZWF0ZSBvciByZXBsYWNlIGZ1bmN0aW9uIHByaXZhdGUuYm9vdHN0cmFwX3BsYXRmb3JtX3N1cGVyX2FkbWluKAogIHRhcmdldF9lbWFpbCB0ZXh0CikKcmV0dXJucyB1dWlkCmxhbmd1YWdlIHBscGdzcWwKc2VjdXJpdHkgZGVmaW5lcgpzZXQgc2VhcmNoX3BhdGggPSBwZ19jYXRhbG9nCmFzICRmdW5jdGlvbiQKZGVjbGFyZQogIG5vcm1hbGl6ZWRfZW1haWwgdGV4dDsKICB0YXJnZXRfdXNlcl9pZCB1dWlkOwpiZWdpbgogIG5vcm1hbGl6ZWRfZW1haWwgOj0gbG93ZXIoCiAgICBidHJpbSgKICAgICAgY29hbGVzY2UoCiAgICAgICAgdGFyZ2V0X2VtYWlsLAogICAgICAgICcnCiAgICAgICkKICAgICkKICApOwoKICBpZiBub3JtYWxpemVkX2VtYWlsID0gJycKICAgIG9yIGNoYXJfbGVuZ3RoKG5vcm1hbGl6ZWRfZW1haWwpID4gMzIwCiAgdGhlbgogICAgcmFpc2UgZXhjZXB0aW9uCiAgICAgIHVzaW5nCiAgICAgICAgZXJyY29kZSA9ICcyMjAyMycsCiAgICAgICAgbWVzc2FnZSA9ICdBIHZhbGlkIHRhcmdldCBlbWFpbCBpcyByZXF1aXJlZC4nOwogIGVuZCBpZjsKCiAgaWYgZXhpc3RzICgKICAgIHNlbGVjdCAxCiAgICBmcm9tIHB1YmxpYy51c2VyX3Byb2ZpbGVzIGFzIGV4aXN0aW5nX3Byb2ZpbGUKICAgIHdoZXJlIGV4aXN0aW5nX3Byb2ZpbGUucGxhdGZvcm1fcm9sZSA9ICdwbGF0Zm9ybV9zdXBlcl9hZG1pbicKICApIHRoZW4KICAgIHJhaXNlIGV4Y2VwdGlvbgogICAgICB1c2luZwogICAgICAgIGVycmNvZGUgPSAnMjM1MDUnLAogICAgICAgIG1lc3NhZ2UgPSAnQSBQbGF0Zm9ybSBTdXBlciBBZG1pbiBoYXMgYWxyZWFkeSBiZWVuIGJvb3RzdHJhcHBlZC4nOwogIGVuZCBpZjsKCiAgc2VsZWN0IGF1dGhfdXNlci5pZAogIGludG8gdGFyZ2V0X3VzZXJfaWQKICBmcm9tIGF1dGgudXNlcnMgYXMgYXV0aF91c2VyCiAgd2hlcmUgbG93ZXIoCiAgICBidHJpbSgKICAgICAgY29hbGVzY2UoCiAgICAgICAgYXV0aF91c2VyLmVtYWlsLAogICAgICAgICcnCiAgICAgICkKICAgICkKICApID0gbm9ybWFsaXplZF9lbWFpbAogIG9yZGVyIGJ5IGF1dGhfdXNlci5jcmVhdGVkX2F0IGFzYwogIGxpbWl0IDE7CgogIGlmIHRhcmdldF91c2VyX2lkIGlzIG51bGwgdGhlbgogICAgcmFpc2UgZXhjZXB0aW9uCiAgICAgIHVzaW5nCiAgICAgICAgZXJyY29kZSA9ICdQMDAwMicsCiAgICAgICAgbWVzc2FnZSA9ICdObyBTdXBhYmFzZSBBdXRoIHVzZXIgZXhpc3RzIGZvciB0aGUgc3VwcGxpZWQgZW1haWwuJzsKICBlbmQgaWY7CgogIGluc2VydCBpbnRvIHB1YmxpYy51c2VyX3Byb2ZpbGVzICgKICAgIHVzZXJfaWQsCiAgICBkaXNwbGF5X25hbWUKICApCiAgc2VsZWN0CiAgICBhdXRoX3VzZXIuaWQsCiAgICBsZWZ0KAogICAgICBudWxsaWYoCiAgICAgICAgYnRyaW0oCiAgICAgICAgICBjb2FsZXNjZSgKICAgICAgICAgICAgYXV0aF91c2VyLnJhd191c2VyX21ldGFfZGF0YSAtPj4gJ2Rpc3BsYXlfbmFtZScsCiAgICAgICAgICAgICcnCiAgICAgICAgICApCiAgICAgICAgKSwKICAgICAgICAnJwogICAgICApLAogICAgICAxMjAKICAgICkKICBmcm9tIGF1dGgudXNlcnMgYXMgYXV0aF91c2VyCiAgd2hlcmUgYXV0aF91c2VyLmlkID0gdGFyZ2V0X3VzZXJfaWQKICBvbiBjb25mbGljdCAodXNlcl9pZCkgZG8gbm90aGluZzsKCiAgcGVyZm9ybSBzZXRfY29uZmlnKAogICAgJ2FwcC5ib290c3RyYXBfcGxhdGZvcm1fc3VwZXJfYWRtaW4nLAogICAgJ3RydWUnLAogICAgdHJ1ZQogICk7CgogIHVwZGF0ZSBwdWJsaWMudXNlcl9wcm9maWxlcwogIHNldAogICAgcGxhdGZvcm1fcm9sZSA9ICdwbGF0Zm9ybV9zdXBlcl9hZG1pbicsCiAgICBzdGF0dXMgPSAnYWN0aXZlJwogIHdoZXJlIHVzZXJfaWQgPSB0YXJnZXRfdXNlcl9pZDsKCiAgaWYgbm90IGZvdW5kIHRoZW4KICAgIHJhaXNlIGV4Y2VwdGlvbgogICAgICB1c2luZwogICAgICAgIGVycmNvZGUgPSAnUDAwMDInLAogICAgICAgIG1lc3NhZ2UgPSAnVGhlIHRhcmdldCB1c2VyIHByb2ZpbGUgY291bGQgbm90IGJlIGJvb3RzdHJhcHBlZC4nOwogIGVuZCBpZjsKCiAgaW5zZXJ0IGludG8gcHVibGljLmF1ZGl0X2V2ZW50cyAoCiAgICBjb21wYW55X2lkLAogICAgYWN0b3JfdXNlcl9pZCwKICAgIHJlcXVlc3RfaWQsCiAgICBldmVudF9uYW1lLAogICAgZW50aXR5X3R5cGUsCiAgICBlbnRpdHlfaWQsCiAgICBtZXRhZGF0YQogICkKICB2YWx1ZXMgKAogICAgbnVsbCwKICAgIHRhcmdldF91c2VyX2lkLAogICAgbnVsbCwKICAgICdwbGF0Zm9ybV9hZG1pbi5ib290c3RyYXBwZWQnLAogICAgJ3VzZXJfcHJvZmlsZScsCiAgICB0YXJnZXRfdXNlcl9pZDo6dGV4dCwKICAgIGpzb25iX2J1aWxkX29iamVjdCgKICAgICAgJ2VtYWlsJywKICAgICAgbm9ybWFsaXplZF9lbWFpbAogICAgKQogICk7CgogIHJldHVybiB0YXJnZXRfdXNlcl9pZDsKZW5kOwokZnVuY3Rpb24kOwoKcmV2b2tlIGFsbApvbiBmdW5jdGlvbiBwcml2YXRlLmJvb3RzdHJhcF9wbGF0Zm9ybV9zdXBlcl9hZG1pbih0ZXh0KQpmcm9tIHB1YmxpYywgYW5vbiwgYXV0aGVudGljYXRlZDsKCmdyYW50IGV4ZWN1dGUKb24gZnVuY3Rpb24gcHJpdmF0ZS5ib290c3RyYXBfcGxhdGZvcm1fc3VwZXJfYWRtaW4odGV4dCkKdG8gc2VydmljZV9yb2xlOwoKY29tbWl0Owo=
'@

  Write-Base64File `
    -Path '.cache/production-setup-static-validation.cjs' `
    -Base64Content @'
Y29uc3QgZnMgPSByZXF1aXJlKCdub2RlOmZzJyk7Cgpjb25zdCByZXF1aXJlZEZpbGVzID0gWwogICdwYWNrYWdlcy9jb25maWcvc3JjL2xvYWQtcm9vdC1lbnZpcm9ubWVudC50cycsCiAgJ3BhY2thZ2VzL2NvbmZpZy9zcmMvaW5kZXgudHMnLAogICdhcHBzL2FwaS9zcmMvbWFpbi50cycsCiAgJ2FwcHMvdHJhY2tlci9zcmMvbWFpbi50cycsCiAgJ2FwcHMvd29ya2VyL3NyYy9tYWluLnRzJywKICAnc3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDcyMzA2MzAwMF9hZGRfcGxhdGZvcm1fc3VwZXJfYWRtaW5fYm9vdHN0cmFwLnNxbCcsCl07Cgpmb3IgKGNvbnN0IHBhdGggb2YgcmVxdWlyZWRGaWxlcykgewogIGlmICghZnMuZXhpc3RzU3luYyhwYXRoKSkgewogICAgdGhyb3cgbmV3IEVycm9yKGBSZXF1aXJlZCBwcm9kdWN0aW9uLXNldHVwIGZpbGUgaXMgbWlzc2luZzogJHtwYXRofWApOwogIH0KfQoKY29uc3QgY29uZmlnSW5kZXggPSBmcy5yZWFkRmlsZVN5bmMoCiAgJ3BhY2thZ2VzL2NvbmZpZy9zcmMvaW5kZXgudHMnLAogICd1dGY4JywKKTsKCmlmICgKICAhY29uZmlnSW5kZXguaW5jbHVkZXMoCiAgICAiZXhwb3J0IHsgbG9hZFJvb3RFbnZpcm9ubWVudEZpbGUgfSBmcm9tICcuL2xvYWQtcm9vdC1lbnZpcm9ubWVudC5qcyc7IiwKICApCikgewogIHRocm93IG5ldyBFcnJvcigKICAgICdUaGUgc2hhcmVkIGNvbmZpZ3VyYXRpb24gcGFja2FnZSBkb2VzIG5vdCBleHBvcnQgbG9hZFJvb3RFbnZpcm9ubWVudEZpbGUuJywKICApOwp9Cgpmb3IgKGNvbnN0IHBhdGggb2YgWwogICdhcHBzL2FwaS9zcmMvbWFpbi50cycsCiAgJ2FwcHMvdHJhY2tlci9zcmMvbWFpbi50cycsCiAgJ2FwcHMvd29ya2VyL3NyYy9tYWluLnRzJywKXSkgewogIGNvbnN0IHNvdXJjZSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLCAndXRmOCcpOwoKICBpZiAoCiAgICAhc291cmNlLmluY2x1ZGVzKAogICAgICAiaW1wb3J0IHsgbG9hZFJvb3RFbnZpcm9ubWVudEZpbGUgfSBmcm9tICdAYWZmaWxpYXRlLXRyYWNrZXIvY29uZmlnJzsiLAogICAgKQogICkgewogICAgdGhyb3cgbmV3IEVycm9yKAogICAgICBgUm9vdCBlbnZpcm9ubWVudCBsb2FkZXIgaW1wb3J0IGlzIG1pc3Npbmc6ICR7cGF0aH1gLAogICAgKTsKICB9CgogIGlmICghc291cmNlLmluY2x1ZGVzKCdsb2FkUm9vdEVudmlyb25tZW50RmlsZSgpOycpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoCiAgICAgIGBSb290IGVudmlyb25tZW50IGxvYWRlciBjYWxsIGlzIG1pc3Npbmc6ICR7cGF0aH1gLAogICAgKTsKICB9CgogIGlmICgKICAgIHNvdXJjZS5pbmRleE9mKCdsb2FkUm9vdEVudmlyb25tZW50RmlsZSgpOycpID4KICAgIHNvdXJjZS5pbmRleE9mKCdhd2FpdCBib290c3RyYXAoKTsnKQogICkgewogICAgdGhyb3cgbmV3IEVycm9yKAogICAgICBgUm9vdCBlbnZpcm9ubWVudCBsb2FkaW5nIG9jY3VycyBhZnRlciBib290c3RyYXA6ICR7cGF0aH1gLAogICAgKTsKICB9Cn0KCmNvbnN0IG1pZ3JhdGlvbiA9IGZzLnJlYWRGaWxlU3luYygKICAnc3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDcyMzA2MzAwMF9hZGRfcGxhdGZvcm1fc3VwZXJfYWRtaW5fYm9vdHN0cmFwLnNxbCcsCiAgJ3V0ZjgnLAopOwoKZm9yIChjb25zdCBtYXJrZXIgb2YgWwogICdwcml2YXRlLmJvb3RzdHJhcF9wbGF0Zm9ybV9zdXBlcl9hZG1pbicsCiAgImN1cnJlbnRfc2V0dGluZygiLAogICInYXBwLmJvb3RzdHJhcF9wbGF0Zm9ybV9zdXBlcl9hZG1pbiciLAogICJzZXRfY29uZmlnKCIsCiAgInBsYXRmb3JtX3JvbGUgPSAncGxhdGZvcm1fc3VwZXJfYWRtaW4nIiwKICAnQSBQbGF0Zm9ybSBTdXBlciBBZG1pbiBoYXMgYWxyZWFkeSBiZWVuIGJvb3RzdHJhcHBlZC4nLAogICdyZXZva2UgYWxsJywKICAndG8gc2VydmljZV9yb2xlJywKICAnc2V0IHNlYXJjaF9wYXRoID0gcGdfY2F0YWxvZycsCl0pIHsKICBpZiAoIW1pZ3JhdGlvbi5pbmNsdWRlcyhtYXJrZXIpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoCiAgICAgIGBQbGF0Zm9ybS1hZG1pbiBib290c3RyYXAgbWlncmF0aW9uIG1hcmtlciBpcyBtaXNzaW5nOiAke21hcmtlcn1gLAogICAgKTsKICB9Cn0KCmNvbnNvbGUubG9nKAogICdSb290IGVudmlyb25tZW50IGxvYWRpbmcgYW5kIG9uZS10aW1lIFBsYXRmb3JtIFN1cGVyIEFkbWluIGJvb3RzdHJhcCBzdGF0aWMgdmFsaWRhdGlvbiBwYXNzZWQuJywKKTsK
'@

  Write-Base64File `
    -Path '.cache/production-setup-runtime-validation.mjs' `
    -Base64Content @'
aW1wb3J0IHsKICBta2R0ZW1wLAogIG1rZGlyLAogIHJtLAogIHdyaXRlRmlsZSwKfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJzsKaW1wb3J0IG9zIGZyb20gJ25vZGU6b3MnOwppbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnOwoKaW1wb3J0IHsgbG9hZFJvb3RFbnZpcm9ubWVudEZpbGUgfSBmcm9tICcuL3BhY2thZ2VzL2NvbmZpZy9kaXN0L2luZGV4LmpzJzsKCmNvbnN0IHRlbXBvcmFyeVJvb3QgPSBhd2FpdCBta2R0ZW1wKAogIHBhdGguam9pbigKICAgIG9zLnRtcGRpcigpLAogICAgJ2FmZmlsaWF0ZS10cmFja2VyLWVudi1sb2FkZXItJywKICApLAopOwoKY29uc3QgdmFsaWRhdGlvblZhcmlhYmxlID0KICAnQUZGSUxJQVRFX1RSQUNLRVJfRU5WX0xPQURFUl9WQUxJREFUSU9OJzsKCnRyeSB7CiAgY29uc3QgbmVzdGVkRGlyZWN0b3J5ID0gcGF0aC5qb2luKAogICAgdGVtcG9yYXJ5Um9vdCwKICAgICdhcHBzJywKICAgICdhcGknLAogICk7CgogIGF3YWl0IG1rZGlyKAogICAgbmVzdGVkRGlyZWN0b3J5LAogICAgewogICAgICByZWN1cnNpdmU6IHRydWUsCiAgICB9LAogICk7CgogIGF3YWl0IHdyaXRlRmlsZSgKICAgIHBhdGguam9pbigKICAgICAgdGVtcG9yYXJ5Um9vdCwKICAgICAgJ3BhY2thZ2UuanNvbicsCiAgICApLAogICAgSlNPTi5zdHJpbmdpZnkoCiAgICAgIHsKICAgICAgICBwcml2YXRlOiB0cnVlLAogICAgICB9LAogICAgKSwKICAgICd1dGY4JywKICApOwoKICBhd2FpdCB3cml0ZUZpbGUoCiAgICBwYXRoLmpvaW4oCiAgICAgIHRlbXBvcmFyeVJvb3QsCiAgICAgICdwbnBtLXdvcmtzcGFjZS55YW1sJywKICAgICksCiAgICAicGFja2FnZXM6XG4gIC0gJ2FwcHMvKidcbiIsCiAgICAndXRmOCcsCiAgKTsKCiAgYXdhaXQgd3JpdGVGaWxlKAogICAgcGF0aC5qb2luKAogICAgICB0ZW1wb3JhcnlSb290LAogICAgICAnLmVudicsCiAgICApLAogICAgYCR7dmFsaWRhdGlvblZhcmlhYmxlfT1sb2FkZWQtZnJvbS1yb290XG5gLAogICAgJ3V0ZjgnLAogICk7CgogIGRlbGV0ZSBwcm9jZXNzLmVudlt2YWxpZGF0aW9uVmFyaWFibGVdOwoKICBjb25zdCBsb2FkZWRQYXRoID0gbG9hZFJvb3RFbnZpcm9ubWVudEZpbGUoewogICAgc3RhcnREaXJlY3Rvcnk6IG5lc3RlZERpcmVjdG9yeSwKICB9KTsKCiAgaWYgKAogICAgbG9hZGVkUGF0aCAhPT0KICAgIHBhdGguam9pbigKICAgICAgdGVtcG9yYXJ5Um9vdCwKICAgICAgJy5lbnYnLAogICAgKQogICkgewogICAgdGhyb3cgbmV3IEVycm9yKAogICAgICAnVGhlIGVudmlyb25tZW50IGxvYWRlciBkaWQgbm90IHJlc29sdmUgdGhlIHdvcmtzcGFjZS1yb290IC5lbnYgZmlsZS4nLAogICAgKTsKICB9CgogIGlmICgKICAgIHByb2Nlc3MuZW52W3ZhbGlkYXRpb25WYXJpYWJsZV0gIT09CiAgICAnbG9hZGVkLWZyb20tcm9vdCcKICApIHsKICAgIHRocm93IG5ldyBFcnJvcigKICAgICAgJ1RoZSB3b3Jrc3BhY2Utcm9vdCAuZW52IHZhbHVlIHdhcyBub3QgbG9hZGVkIGludG8gcHJvY2Vzcy5lbnYuJywKICAgICk7CiAgfQoKICBjb25zdCBtaXNzaW5nUGF0aCA9IGxvYWRSb290RW52aXJvbm1lbnRGaWxlKHsKICAgIHN0YXJ0RGlyZWN0b3J5OiBuZXN0ZWREaXJlY3RvcnksCiAgICBmaWxlTmFtZTogJy5lbnYubWlzc2luZycsCiAgfSk7CgogIGlmIChtaXNzaW5nUGF0aCAhPT0gdW5kZWZpbmVkKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoCiAgICAgICdBIG1pc3Npbmcgb3B0aW9uYWwgZW52aXJvbm1lbnQgZmlsZSBzaG91bGQgbm90IGJlIHJlcG9ydGVkIGFzIGxvYWRlZC4nLAogICAgKTsKICB9CgogIGNvbnNvbGUubG9nKAogICAgJ1dvcmtzcGFjZS1yb290IGVudmlyb25tZW50IGxvYWRpbmcgcnVudGltZSB2YWxpZGF0aW9uIHBhc3NlZC4nLAogICk7Cn0gZmluYWxseSB7CiAgZGVsZXRlIHByb2Nlc3MuZW52W3ZhbGlkYXRpb25WYXJpYWJsZV07CgogIGF3YWl0IHJtKAogICAgdGVtcG9yYXJ5Um9vdCwKICAgIHsKICAgICAgZm9yY2U6IHRydWUsCiAgICAgIHJlY3Vyc2l2ZTogdHJ1ZSwKICAgIH0sCiAgKTsKfQo=
'@

  $patcher = @'
const fs = require('node:fs');

function read(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`Required source file is missing: ${path}`);
  }

  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(
    path,
    content,
    'utf8',
  );
}

function replaceExactOnce(
  source,
  searchValue,
  replacementValue,
  label,
) {
  const firstIndex =
    source.indexOf(searchValue);

  if (firstIndex < 0) {
    throw new Error(
      `${label}: exact anchor was not found.`,
    );
  }

  const secondIndex =
    source.indexOf(
      searchValue,
      firstIndex + searchValue.length,
    );

  if (secondIndex >= 0) {
    throw new Error(
      `${label}: exact anchor is not unique.`,
    );
  }

  return (
    source.slice(0, firstIndex) +
    replacementValue +
    source.slice(
      firstIndex + searchValue.length,
    )
  );
}

const configIndexPath =
  'packages/config/src/index.ts';

let configIndex =
  read(configIndexPath);

const loaderExport =
  "export { loadRootEnvironmentFile } from './load-root-environment.js';";

if (!configIndex.includes(loaderExport)) {
  configIndex = replaceExactOnce(
    configIndex,
    "import type { ZodType } from 'zod';",
    `import type { ZodType } from 'zod';

${loaderExport}`,
    'Configuration package export',
  );
}

write(
  configIndexPath,
  configIndex,
);

for (const path of [
  'apps/api/src/main.ts',
  'apps/tracker/src/main.ts',
  'apps/worker/src/main.ts',
]) {
  let source = read(path);

  const loaderImport =
    "import { loadRootEnvironmentFile } from '@affiliate-tracker/config';";

  if (!source.includes(loaderImport)) {
    source = replaceExactOnce(
      source,
      "import process from 'node:process';",
      `import process from 'node:process';

${loaderImport}`,
      `${path} loader import`,
    );
  }

  if (!source.includes('loadRootEnvironmentFile();')) {
    source = replaceExactOnce(
      source,
      `try {
  await bootstrap();`,
      `try {
  loadRootEnvironmentFile();
  await bootstrap();`,
      `${path} loader invocation`,
    );
  }

  write(
    path,
    source,
  );
}

console.log(
  'API, Tracker, Worker, and shared config environment-loader wiring completed.',
);
'@

  $patcher |
    node --input-type=commonjs

  Assert-NativeCommand `
    'Production setup environment-loader wiring'

  $formatFiles = @(
    '.\packages\config\src\load-root-environment.ts',
    '.\packages\config\src\index.ts',
    '.\apps\api\src\main.ts',
    '.\apps\tracker\src\main.ts',
    '.\apps\worker\src\main.ts'
  )

  Write-Host ''
  Write-Host 'Formatting production-setup TypeScript files one at a time.'

  foreach ($formatFile in $formatFiles) {
    pnpm exec prettier `
      --write `
      $formatFile

    Assert-NativeCommand (
      'Production setup formatting: ' +
      $formatFile
    )
  }

  Write-Host ''
  Write-Host 'Running root environment and admin-bootstrap static validation.'

  node '.\.cache\production-setup-static-validation.cjs'
  Assert-NativeCommand `
    'Production setup static validation'

  Write-Host ''
  Write-Host 'Running targeted typecheck and lint.'

  pnpm --filter @affiliate-tracker/config typecheck
  Assert-NativeCommand `
    'Config package typecheck'

  pnpm --filter @affiliate-tracker/config lint
  Assert-NativeCommand `
    'Config package lint'

  pnpm --filter @affiliate-tracker/api typecheck
  Assert-NativeCommand `
    'API typecheck'

  pnpm --filter @affiliate-tracker/tracker typecheck
  Assert-NativeCommand `
    'Tracker typecheck'

  pnpm --filter @affiliate-tracker/worker typecheck
  Assert-NativeCommand `
    'Worker typecheck'

  Write-Host ''
  Write-Host 'Running complete production quality gate.'

  pnpm production:check
  Assert-NativeCommand `
    'Complete production quality gate'

  Write-Host ''
  Write-Host 'Running root environment loader runtime validation.'

  node '.\.cache\production-setup-runtime-validation.mjs'
  Assert-NativeCommand `
    'Root environment loader runtime validation'

  Remove-Item `
    '.\.cache\production-setup-static-validation.cjs' `
    -Force `
    -ErrorAction SilentlyContinue

  Remove-Item `
    '.\.cache\production-setup-runtime-validation.mjs' `
    -Force `
    -ErrorAction SilentlyContinue

  Write-Host ''
  git status --short

  if ($LASTEXITCODE -ne 0) {
    throw 'Git status failed.'
  }

  Write-Host ''
  Write-Host 'PRODUCTION SETUP STEP 1 PASSED'
  Write-Host 'ROOT ENVIRONMENT LOADING AND PLATFORM ADMIN BOOTSTRAP ARE READY'
}
