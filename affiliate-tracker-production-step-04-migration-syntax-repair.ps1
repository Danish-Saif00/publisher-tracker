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

  $targetMigrations = @(
    '.\supabase\migrations\20260723013000_create_offers_assignments_and_payout_foundation.sql',
    '.\supabase\migrations\20260723023000_create_tracking_links_and_redirect_foundation.sql',
    '.\supabase\migrations\20260723033000_create_click_capture_and_visitor_identity_foundation.sql',
    '.\supabase\migrations\20260723042500_create_duplicate_protection_and_fraud_signals.sql',
    '.\supabase\migrations\20260723043000_create_conversions_and_postbacks_foundation.sql',
    '.\supabase\migrations\20260723053000_create_reporting_operations_and_customization.sql'
  )

  foreach ($migrationPath in $targetMigrations) {
    if (-not (Test-Path $migrationPath)) {
      throw "Required migration is missing: $migrationPath"
    }
  }

  Write-Host ''
  Write-Host 'Repairing PostgreSQL multi-function GRANT and REVOKE syntax.'

  @'
const fs = require('node:fs');

const paths = [
  'supabase/migrations/20260723013000_create_offers_assignments_and_payout_foundation.sql',
  'supabase/migrations/20260723023000_create_tracking_links_and_redirect_foundation.sql',
  'supabase/migrations/20260723033000_create_click_capture_and_visitor_identity_foundation.sql',
  'supabase/migrations/20260723042500_create_duplicate_protection_and_fraud_signals.sql',
  'supabase/migrations/20260723043000_create_conversions_and_postbacks_foundation.sql',
  'supabase/migrations/20260723053000_create_reporting_operations_and_customization.sql',
];

const invalidPattern =
  /,(\r?\n[ \t]*)function (?=(?:private|public)\.)/gu;

let totalMatches = 0;
const sources = new Map();

for (const path of paths) {
  const source = fs.readFileSync(path, 'utf8');
  const matches = [...source.matchAll(invalidPattern)];

  totalMatches += matches.length;
  sources.set(path, source);
}

if (totalMatches !== 0 && totalMatches !== 25) {
  throw new Error(
    `Expected either 25 unrepaired occurrences or 0 repaired occurrences, found ${totalMatches}.`,
  );
}

if (totalMatches === 25) {
  for (const [path, source] of sources) {
    const repaired = source.replace(
      invalidPattern,
      ',$1',
    );

    fs.writeFileSync(
      path,
      repaired,
      'utf8',
    );
  }

  console.log(
    'Removed 25 repeated FUNCTION keywords from PostgreSQL privilege lists.',
  );
} else {
  console.log(
    'PostgreSQL privilege lists were already repaired.',
  );
}

for (const path of paths) {
  const source = fs.readFileSync(path, 'utf8');

  invalidPattern.lastIndex = 0;

  if (invalidPattern.test(source)) {
    throw new Error(
      `Invalid repeated FUNCTION syntax remains in ${path}.`,
    );
  }
}

const packagePath = 'package.json';
const packageJson = JSON.parse(
  fs.readFileSync(
    packagePath,
    'utf8',
  ),
);

packageJson.scripts ??= {};

packageJson.scripts['validate:function-privileges'] =
  'node scripts/validate-function-privilege-syntax.mjs';

packageJson.scripts['production:check'] =
  'pnpm check && pnpm validate:migrations && pnpm validate:function-privileges && pnpm validate:openapi && pnpm validate:security';

fs.writeFileSync(
  packagePath,
  `${JSON.stringify(packageJson, null, 2)}\n`,
  'utf8',
);

console.log(
  'Permanent function privilege syntax validation was added to production:check.',
);
'@ |
    node --input-type=commonjs

  Assert-NativeCommand `
    'PostgreSQL privilege syntax repair'

  $validatorBase64 = @'
aW1wb3J0IHsgcmVhZGRpciwgcmVhZEZpbGUgfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJzsKaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJzsKaW1wb3J0IHByb2Nlc3MgZnJvbSAnbm9kZTpwcm9jZXNzJzsKCmNvbnN0IG1pZ3JhdGlvbnNEaXJlY3RvcnkgPSBwYXRoLnJlc29sdmUoCiAgcHJvY2Vzcy5jd2QoKSwKICAnc3VwYWJhc2UnLAogICdtaWdyYXRpb25zJywKKTsKCmNvbnN0IGludmFsaWRSZXBlYXRlZEZ1bmN0aW9uS2V5d29yZFBhdHRlcm4gPQogIC8sXHMqZnVuY3Rpb25ccysoPzpwcml2YXRlfHB1YmxpYylcLi9naXU7CgpmdW5jdGlvbiBnZXRMaW5lTnVtYmVyKHNvdXJjZSwgaW5kZXgpIHsKICByZXR1cm4gc291cmNlLnNsaWNlKDAsIGluZGV4KS5zcGxpdCgvXHI/XG4vdSkubGVuZ3RoOwp9Cgpjb25zdCBtaWdyYXRpb25OYW1lcyA9ICgKICBhd2FpdCByZWFkZGlyKG1pZ3JhdGlvbnNEaXJlY3RvcnkpCikKICAuZmlsdGVyKChuYW1lKSA9PiBuYW1lLmVuZHNXaXRoKCcuc3FsJykpCiAgLnNvcnQoKTsKCmNvbnN0IGZhaWx1cmVzID0gW107Cgpmb3IgKGNvbnN0IG1pZ3JhdGlvbk5hbWUgb2YgbWlncmF0aW9uTmFtZXMpIHsKICBjb25zdCBtaWdyYXRpb25QYXRoID0gcGF0aC5qb2luKAogICAgbWlncmF0aW9uc0RpcmVjdG9yeSwKICAgIG1pZ3JhdGlvbk5hbWUsCiAgKTsKCiAgY29uc3Qgc291cmNlID0gYXdhaXQgcmVhZEZpbGUoCiAgICBtaWdyYXRpb25QYXRoLAogICAgJ3V0ZjgnLAogICk7CgogIGZvciAoCiAgICBjb25zdCBtYXRjaCBvZiBzb3VyY2UubWF0Y2hBbGwoCiAgICAgIGludmFsaWRSZXBlYXRlZEZ1bmN0aW9uS2V5d29yZFBhdHRlcm4sCiAgICApCiAgKSB7CiAgICBmYWlsdXJlcy5wdXNoKAogICAgICBgJHttaWdyYXRpb25OYW1lfToke2dldExpbmVOdW1iZXIoCiAgICAgICAgc291cmNlLAogICAgICAgIG1hdGNoLmluZGV4LAogICAgICApfSByZXBlYXRzIEZVTkNUSU9OIGFmdGVyIGEgY29tbWEgaW4gYW4gT04gRlVOQ1RJT04gcHJpdmlsZWdlIGxpc3QuYCwKICAgICk7CiAgfQp9CgppZiAoZmFpbHVyZXMubGVuZ3RoID4gMCkgewogIHRocm93IG5ldyBFcnJvcigKICAgIFsKICAgICAgJ0ludmFsaWQgUG9zdGdyZVNRTCBmdW5jdGlvbiBwcml2aWxlZ2Ugc3ludGF4IGRldGVjdGVkLicsCiAgICAgIC4uLmZhaWx1cmVzLAogICAgXS5qb2luKCdcbicpLAogICk7Cn0KCmNvbnNvbGUubG9nKAogIGBGdW5jdGlvbiBwcml2aWxlZ2Ugc3ludGF4IHZhbGlkYXRpb24gcGFzc2VkIGZvciAke21pZ3JhdGlvbk5hbWVzLmxlbmd0aH0gbWlncmF0aW9ucy5gLAopOwpjb25zb2xlLmxvZygKICAnUFJPRFVDVElPTiBGVU5DVElPTiBQUklWSUxFR0UgVkFMSURBVElPTiBQQVNTRUQnLAopOwo=
'@

  [System.IO.File]::WriteAllBytes(
    (
      Join-Path `
        (Get-Location) `
        'scripts\validate-function-privilege-syntax.mjs'
    ),
    [System.Convert]::FromBase64String(
      $validatorBase64.Trim()
    )
  )

  Write-Host ''
  Write-Host 'Formatting the new validator and package manifest.'

  pnpm exec prettier `
    --write `
    '.\scripts\validate-function-privilege-syntax.mjs'

  Assert-NativeCommand `
    'Function privilege validator formatting'

  pnpm exec prettier `
    --write `
    '.\package.json'

  Assert-NativeCommand `
    'Package manifest formatting'

  Write-Host ''
  Write-Host 'Running targeted migration validations.'

  pnpm validate:migrations
  Assert-NativeCommand `
    'Migration validation'

  pnpm validate:function-privileges
  Assert-NativeCommand `
    'Function privilege syntax validation'

  Write-Host ''
  Write-Host 'Running complete production quality gate.'

  pnpm production:check
  Assert-NativeCommand `
    'Complete production quality gate'

  Write-Host ''
  Write-Host 'Running a non-mutating remote migration dry run.'

  pnpm db:push:dry
  Assert-NativeCommand `
    'Remote migration dry run'

  Write-Host ''
  Write-Host 'SUPABASE MIGRATION PRIVILEGE SYNTAX REPAIR PASSED'
  Write-Host 'REMOTE DATABASE WAS NOT MODIFIED BY THIS REPAIR SCRIPT'
  Write-Host 'NEXT COMMAND AFTER REVIEW: pnpm db:push'
}
