import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationsDirectory = path.resolve(process.cwd(), 'supabase', 'migrations');

const invalidRepeatedFunctionKeywordPattern = /,\s*function\s+(?:private|public)\./giu;

function getLineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const failures = [];

for (const migrationName of migrationNames) {
  const migrationPath = path.join(migrationsDirectory, migrationName);

  const source = await readFile(migrationPath, 'utf8');

  for (const match of source.matchAll(invalidRepeatedFunctionKeywordPattern)) {
    failures.push(
      `${migrationName}:${getLineNumber(
        source,
        match.index,
      )} repeats FUNCTION after a comma in an ON FUNCTION privilege list.`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    ['Invalid PostgreSQL function privilege syntax detected.', ...failures].join('\n'),
  );
}

console.log(`Function privilege syntax validation passed for ${migrationNames.length} migrations.`);
console.log('PRODUCTION FUNCTION PRIVILEGE VALIDATION PASSED');
