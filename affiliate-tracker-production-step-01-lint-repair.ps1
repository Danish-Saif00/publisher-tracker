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

  $originalStepScript =
    '.\affiliate-tracker-production-step-01-env-and-admin-bootstrap.ps1'

  $loaderPath =
    '.\packages\config\src\load-root-environment.ts'

  $migrationPath =
    '.\supabase\migrations\20260723063000_add_platform_super_admin_bootstrap.sql'

  $nodeDirectory = Join-Path `
    (Get-Location) `
    '.tools\node-v24.18.0-win-x64'

  $nodeExecutable = Join-Path `
    $nodeDirectory `
    'node.exe'

  foreach ($requiredFile in @(
    $originalStepScript,
    $loaderPath,
    $migrationPath,
    '.\packages\config\src\index.ts',
    '.\apps\api\src\main.ts',
    '.\apps\tracker\src\main.ts',
    '.\apps\worker\src\main.ts'
  )) {
    if (-not (Test-Path $requiredFile)) {
      throw "Required production setup file is missing: $requiredFile"
    }
  }

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
  Write-Host 'Replacing the environment loader with a lint-safe recursive implementation.'

  $correctedLoaderBase64 = @'
aW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gJ25vZGU6ZnMnOwppbXBvcnQgeyBkaXJuYW1lLCByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJzsKaW1wb3J0IHByb2Nlc3MgZnJvbSAnbm9kZTpwcm9jZXNzJzsKCmNvbnN0IFdPUktTUEFDRV9NQVJLRVJfRklMRSA9ICdwbnBtLXdvcmtzcGFjZS55YW1sJzsKY29uc3QgUEFDS0FHRV9NQVJLRVJfRklMRSA9ICdwYWNrYWdlLmpzb24nOwpjb25zdCBERUZBVUxUX0VOVl9GSUxFX05BTUUgPSAnLmVudic7CgpleHBvcnQgaW50ZXJmYWNlIExvYWRSb290RW52aXJvbm1lbnRGaWxlT3B0aW9ucyB7CiAgcmVhZG9ubHkgc3RhcnREaXJlY3Rvcnk/OiBzdHJpbmc7CiAgcmVhZG9ubHkgZmlsZU5hbWU/OiBzdHJpbmc7Cn0KCmZ1bmN0aW9uIGZpbmRXb3Jrc3BhY2VSb290KHN0YXJ0RGlyZWN0b3J5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgewogIGNvbnN0IGN1cnJlbnREaXJlY3RvcnkgPSByZXNvbHZlKHN0YXJ0RGlyZWN0b3J5KTsKICBjb25zdCB3b3Jrc3BhY2VNYXJrZXJQYXRoID0gcmVzb2x2ZShjdXJyZW50RGlyZWN0b3J5LCBXT1JLU1BBQ0VfTUFSS0VSX0ZJTEUpOwogIGNvbnN0IHBhY2thZ2VNYXJrZXJQYXRoID0gcmVzb2x2ZShjdXJyZW50RGlyZWN0b3J5LCBQQUNLQUdFX01BUktFUl9GSUxFKTsKCiAgaWYgKGV4aXN0c1N5bmMod29ya3NwYWNlTWFya2VyUGF0aCkgJiYgZXhpc3RzU3luYyhwYWNrYWdlTWFya2VyUGF0aCkpIHsKICAgIHJldHVybiBjdXJyZW50RGlyZWN0b3J5OwogIH0KCiAgY29uc3QgcGFyZW50RGlyZWN0b3J5ID0gZGlybmFtZShjdXJyZW50RGlyZWN0b3J5KTsKCiAgcmV0dXJuIHBhcmVudERpcmVjdG9yeSA9PT0gY3VycmVudERpcmVjdG9yeQogICAgPyB1bmRlZmluZWQKICAgIDogZmluZFdvcmtzcGFjZVJvb3QocGFyZW50RGlyZWN0b3J5KTsKfQoKZXhwb3J0IGZ1bmN0aW9uIGxvYWRSb290RW52aXJvbm1lbnRGaWxlKAogIG9wdGlvbnM6IExvYWRSb290RW52aXJvbm1lbnRGaWxlT3B0aW9ucyA9IHt9LAopOiBzdHJpbmcgfCB1bmRlZmluZWQgewogIGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBmaW5kV29ya3NwYWNlUm9vdChvcHRpb25zLnN0YXJ0RGlyZWN0b3J5ID8/IHByb2Nlc3MuY3dkKCkpOwoKICBpZiAod29ya3NwYWNlUm9vdCA9PT0gdW5kZWZpbmVkKSB7CiAgICByZXR1cm4gdW5kZWZpbmVkOwogIH0KCiAgY29uc3QgZW52aXJvbm1lbnRQYXRoID0gcmVzb2x2ZSgKICAgIHdvcmtzcGFjZVJvb3QsCiAgICBvcHRpb25zLmZpbGVOYW1lID8/IERFRkFVTFRfRU5WX0ZJTEVfTkFNRSwKICApOwoKICBpZiAoIWV4aXN0c1N5bmMoZW52aXJvbm1lbnRQYXRoKSkgewogICAgcmV0dXJuIHVuZGVmaW5lZDsKICB9CgogIHByb2Nlc3MubG9hZEVudkZpbGUoZW52aXJvbm1lbnRQYXRoKTsKCiAgcmV0dXJuIGVudmlyb25tZW50UGF0aDsKfQo=
'@

  [System.IO.File]::WriteAllBytes(
    (
      Join-Path `
        (Get-Location) `
        'packages\config\src\load-root-environment.ts'
    ),
    [System.Convert]::FromBase64String(
      $correctedLoaderBase64.Trim()
    )
  )

  $env:CORRECTED_ENV_LOADER_BASE64 =
    $correctedLoaderBase64.Trim()

  try {
    @'
const fs = require('node:fs');

const scriptPath =
  'affiliate-tracker-production-step-01-env-and-admin-bootstrap.ps1';

const embeddedPath =
  'packages/config/src/load-root-environment.ts';

const replacementBase64 =
  process.env.CORRECTED_ENV_LOADER_BASE64;

if (
  typeof replacementBase64 !== 'string' ||
  replacementBase64.length === 0
) {
  throw new Error(
    'Corrected environment-loader payload is unavailable.',
  );
}

const source = fs.readFileSync(
  scriptPath,
  'utf8',
);

const eol = source.includes('\r\n')
  ? '\r\n'
  : '\n';

const lines = source.split(/\r?\n/u);
const pathLine =
  `-Path '${embeddedPath}' \``;

const pathIndexes = [];

for (
  let index = 0;
  index < lines.length;
  index += 1
) {
  if (lines[index].trim() === pathLine) {
    pathIndexes.push(index);
  }
}

if (pathIndexes.length !== 1) {
  throw new Error(
    `Expected one embedded environment-loader path, found ${pathIndexes.length}.`,
  );
}

const pathIndex = pathIndexes[0];
let headerIndex = -1;

for (
  let index = pathIndex + 1;
  index < Math.min(pathIndex + 6, lines.length);
  index += 1
) {
  if (
    lines[index].trim() ===
    "-Base64Content @'"
  ) {
    headerIndex = index;
    break;
  }
}

if (headerIndex < 0) {
  throw new Error(
    'Embedded environment-loader Base64 header was not found.',
  );
}

let terminatorIndex = -1;

for (
  let index = headerIndex + 1;
  index < lines.length;
  index += 1
) {
  if (lines[index].trim() === "'@") {
    terminatorIndex = index;
    break;
  }
}

if (terminatorIndex < 0) {
  throw new Error(
    'Embedded environment-loader Base64 terminator was not found.',
  );
}

lines.splice(
  headerIndex + 1,
  terminatorIndex - headerIndex - 1,
  replacementBase64,
);

fs.writeFileSync(
  scriptPath,
  lines.join(eol),
  'utf8',
);

console.log(
  'Current source and original Production Step 1 script now share the lint-safe loader.',
);
'@ |
      node --input-type=commonjs

    Assert-NativeCommand `
      'Embedded environment-loader synchronization'
  }
  finally {
    Remove-Item `
      Env:CORRECTED_ENV_LOADER_BASE64 `
      -ErrorAction SilentlyContinue
  }

  Write-Host ''
  Write-Host 'Formatting and validating the corrected loader.'

  pnpm exec prettier `
    --write `
    $loaderPath

  Assert-NativeCommand `
    'Environment-loader formatting'

  @'
const fs = require('node:fs');

const loader = fs.readFileSync(
  'packages/config/src/load-root-environment.ts',
  'utf8',
);

for (const forbiddenMarker of [
  'while (true)',
  'for (;;)',
]) {
  if (loader.includes(forbiddenMarker)) {
    throw new Error(
      `The lint-unsafe traversal marker still exists: ${forbiddenMarker}`,
    );
  }
}

for (const requiredMarker of [
  'function findWorkspaceRoot',
  'parentDirectory === currentDirectory',
  'findWorkspaceRoot(parentDirectory)',
  'process.loadEnvFile(environmentPath)',
]) {
  if (!loader.includes(requiredMarker)) {
    throw new Error(
      `Corrected environment-loader marker is missing: ${requiredMarker}`,
    );
  }
}

const migration = fs.readFileSync(
  'supabase/migrations/20260723063000_add_platform_super_admin_bootstrap.sql',
  'utf8',
);

for (const marker of [
  'private.bootstrap_platform_super_admin',
  "platform_role = 'platform_super_admin'",
  'A Platform Super Admin has already been bootstrapped.',
  'to service_role',
  'set search_path = pg_catalog',
]) {
  if (!migration.includes(marker)) {
    throw new Error(
      `Platform-admin bootstrap marker is missing: ${marker}`,
    );
  }
}

for (const path of [
  'apps/api/src/main.ts',
  'apps/tracker/src/main.ts',
  'apps/worker/src/main.ts',
]) {
  const source = fs.readFileSync(path, 'utf8');

  if (
    !source.includes(
      "import { loadRootEnvironmentFile } from '@affiliate-tracker/config';",
    ) ||
    !source.includes('loadRootEnvironmentFile();')
  ) {
    throw new Error(
      `Root environment loading is incomplete: ${path}`,
    );
  }
}

console.log(
  'Environment-loader wiring and Platform Super Admin bootstrap validation passed.',
);
'@ |
    node --input-type=commonjs

  Assert-NativeCommand `
    'Production Step 1 static validation'

  Write-Host ''
  Write-Host 'Running targeted Config package checks.'

  pnpm --filter @affiliate-tracker/config typecheck
  Assert-NativeCommand `
    'Config package typecheck'

  pnpm --filter @affiliate-tracker/config lint
  Assert-NativeCommand `
    'Config package lint'

  Write-Host ''
  Write-Host 'Running complete production quality gate.'

  pnpm production:check
  Assert-NativeCommand `
    'Complete production quality gate'

  Write-Host ''
  Write-Host 'Running workspace-root environment loader runtime validation.'

  @'
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const {
  loadRootEnvironmentFile,
} = await import(
  './packages/config/dist/index.js'
);

const temporaryRoot = await mkdtemp(
  path.join(
    os.tmpdir(),
    'affiliate-tracker-env-loader-',
  ),
);

const validationVariable =
  'AFFILIATE_TRACKER_ENV_LOADER_VALIDATION';

try {
  const nestedDirectory = path.join(
    temporaryRoot,
    'apps',
    'api',
  );

  await mkdir(
    nestedDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    path.join(
      temporaryRoot,
      'package.json',
    ),
    JSON.stringify(
      {
        private: true,
      },
    ),
    'utf8',
  );

  await writeFile(
    path.join(
      temporaryRoot,
      'pnpm-workspace.yaml',
    ),
    "packages:\n  - 'apps/*'\n",
    'utf8',
  );

  await writeFile(
    path.join(
      temporaryRoot,
      '.env',
    ),
    `${validationVariable}=loaded-from-root\n`,
    'utf8',
  );

  delete process.env[validationVariable];

  const loadedPath = loadRootEnvironmentFile({
    startDirectory: nestedDirectory,
  });

  if (
    loadedPath !==
    path.join(
      temporaryRoot,
      '.env',
    )
  ) {
    throw new Error(
      'The environment loader did not resolve the workspace-root .env file.',
    );
  }

  if (
    process.env[validationVariable] !==
    'loaded-from-root'
  ) {
    throw new Error(
      'The workspace-root .env value was not loaded into process.env.',
    );
  }

  const missingPath = loadRootEnvironmentFile({
    startDirectory: nestedDirectory,
    fileName: '.env.missing',
  });

  if (missingPath !== undefined) {
    throw new Error(
      'A missing optional environment file should not be reported as loaded.',
    );
  }

  console.log(
    'Workspace-root environment loading runtime validation passed.',
  );
} finally {
  delete process.env[validationVariable];

  await rm(
    temporaryRoot,
    {
      force: true,
      recursive: true,
    },
  );
}
'@ |
    node --input-type=module

  Assert-NativeCommand `
    'Environment-loader runtime validation'

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
