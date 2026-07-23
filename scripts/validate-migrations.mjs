import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_DIRECTORY = path.resolve('supabase/migrations');
const MIGRATION_FILE_PATTERN = /^(?<version>\d{14})_(?<name>[a-z0-9_]+)\.sql$/u;

function collectMatches(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => match[1]);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const migrationFiles = (await readdir(MIGRATION_DIRECTORY))
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();

assertCondition(migrationFiles.length > 0, 'No Supabase migration files were found.');

const versions = new Set();
const migrationContents = [];

for (const fileName of migrationFiles) {
  const match = MIGRATION_FILE_PATTERN.exec(fileName);

  assertCondition(match !== null, `Migration filename is invalid: ${fileName}`);

  const version = match.groups?.version;

  assertCondition(typeof version === 'string', `Migration version is missing: ${fileName}`);
  assertCondition(!versions.has(version), `Duplicate migration version detected: ${version}`);

  versions.add(version);

  const content = await readFile(path.join(MIGRATION_DIRECTORY, fileName), 'utf8');

  assertCondition(content.trim().length > 0, `Migration is empty: ${fileName}`);
  assertCondition(
    !content.includes('\u0000'),
    `Migration contains an unexpected null byte: ${fileName}`,
  );

  migrationContents.push({
    content,
    fileName,
    version,
  });
}

const duplicateProtectionMigration = migrationContents.find((migration) =>
  migration.fileName.includes('create_duplicate_protection_and_fraud_signals'),
);
const conversionMigration = migrationContents.find((migration) =>
  migration.fileName.includes('create_conversions_and_postbacks_foundation'),
);

assertCondition(
  duplicateProtectionMigration !== undefined,
  'Duplicate-protection migration is missing.',
);
assertCondition(conversionMigration !== undefined, 'Conversion migration is missing.');
assertCondition(
  duplicateProtectionMigration.version < conversionMigration.version,
  'Duplicate-protection migration must run before the conversion migration.',
);

const combinedSql = migrationContents.map((migration) => migration.content).join('\n');

const createdTables = new Set(collectMatches(combinedSql, /create table public\.([a-z0-9_]+)/giu));
const rlsEnabledTables = new Set(
  collectMatches(combinedSql, /alter table public\.([a-z0-9_]+)\s+enable row level security/giu),
);

for (const tableName of createdTables) {
  assertCondition(
    rlsEnabledTables.has(tableName),
    `Row-level security is not enabled for public.${tableName}.`,
  );
}

const functionChunks = combinedSql.split(/(?=create or replace function\s+)/giu);

for (const functionChunk of functionChunks) {
  if (!/create or replace function\s+/iu.test(functionChunk)) {
    continue;
  }

  if (!/\bsecurity definer\b/iu.test(functionChunk)) {
    continue;
  }

  const functionNameMatch = /create or replace function\s+([a-z0-9_.]+)/iu.exec(functionChunk);
  const functionName = functionNameMatch?.[1] ?? '<unknown>';

  assertCondition(
    /\bset search_path\s*=/iu.test(functionChunk),
    `SECURITY DEFINER function ${functionName} does not pin search_path.`,
  );
}

assertCondition(
  !migrationFiles.some(
    (fileName) => fileName === '20260723043000_create_duplicate_protection_and_fraud_signals.sql',
  ),
  'The obsolete duplicate migration timestamp still exists.',
);

console.log(
  `Migration validation passed: ${migrationFiles.length} files, ${createdTables.size} public tables, unique ordered versions, RLS enabled, and SECURITY DEFINER search paths pinned.`,
);
console.log('BATCH 15 MIGRATION VALIDATION PASSED');
