import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const WORKSPACE_MARKER_FILE = 'pnpm-workspace.yaml';
const PACKAGE_MARKER_FILE = 'package.json';
const DEFAULT_ENV_FILE_NAME = '.env';

export interface LoadRootEnvironmentFileOptions {
  readonly startDirectory?: string;
  readonly fileName?: string;
}

function findWorkspaceRoot(startDirectory: string): string | undefined {
  const currentDirectory = resolve(startDirectory);
  const workspaceMarkerPath = resolve(currentDirectory, WORKSPACE_MARKER_FILE);
  const packageMarkerPath = resolve(currentDirectory, PACKAGE_MARKER_FILE);

  if (existsSync(workspaceMarkerPath) && existsSync(packageMarkerPath)) {
    return currentDirectory;
  }

  const parentDirectory = dirname(currentDirectory);

  return parentDirectory === currentDirectory ? undefined : findWorkspaceRoot(parentDirectory);
}

export function loadRootEnvironmentFile(
  options: LoadRootEnvironmentFileOptions = {},
): string | undefined {
  const workspaceRoot = findWorkspaceRoot(options.startDirectory ?? process.cwd());

  if (workspaceRoot === undefined) {
    return undefined;
  }

  const environmentPath = resolve(workspaceRoot, options.fileName ?? DEFAULT_ENV_FILE_NAME);

  if (!existsSync(environmentPath)) {
    return undefined;
  }

  process.loadEnvFile(environmentPath);

  return environmentPath;
}
