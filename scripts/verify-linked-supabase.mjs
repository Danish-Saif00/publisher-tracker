import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const requireLinked = process.argv.includes('--require-linked');
const projectRefPath = path.resolve('supabase/.temp/project-ref');

function runPnpm(arguments_, options = {}) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.captureOutput === true ? 'pipe' : 'inherit',
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${String(result.status)}): pnpm ${arguments_.join(' ')}`);
  }

  return result.stdout ?? '';
}

if (!existsSync(projectRefPath)) {
  if (requireLinked) {
    throw new Error('The repository is not linked to a Supabase project. Run pnpm db:link first.');
  }

  console.log('Linked Supabase verification skipped because supabase/.temp/project-ref is absent.');
  console.log('Run pnpm db:verify:linked after linking the target environment.');
  process.exit(0);
}

if (!requireLinked) {
  console.log('A linked Supabase project was detected. Remote checks were not run automatically.');
  console.log('Run pnpm db:verify:linked to execute read-only remote verification.');
  process.exit(0);
}

runPnpm(['exec', 'supabase', 'migration', 'list', '--linked']);
runPnpm(['exec', 'supabase', 'db', 'push', '--linked', '--dry-run']);
runPnpm(['exec', 'supabase', 'db', 'lint', '--linked', '--level', 'warning']);

const generatedTypes = runPnpm(
  ['exec', 'supabase', 'gen', 'types', 'typescript', '--linked', '--schema', 'public'],
  {
    captureOutput: true,
  },
);

if (!generatedTypes.includes('export type Database')) {
  throw new Error('Supabase generated types output is incomplete.');
}

const generatedTypesPath = path.resolve('packages/database/src/database.generated.types.ts');

await mkdir(path.dirname(generatedTypesPath), {
  recursive: true,
});
await writeFile(generatedTypesPath, generatedTypes, 'utf8');

console.log(`Generated database types: ${generatedTypesPath}`);
console.log('BATCH 15 LINKED SUPABASE VERIFICATION PASSED');
