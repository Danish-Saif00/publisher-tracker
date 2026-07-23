import type { ZodType } from 'zod';

export { loadRootEnvironmentFile } from './load-root-environment.js';

export {
  apiEnvironmentSchema,
  baseServiceEnvironmentSchema,
  databaseEnvironmentSchema,
  emailEnvironmentSchema,
  securityEnvironmentSchema,
  supabaseEnvironmentSchema,
  trackerEnvironmentSchema,
  trackingEnvironmentSchema,
  workerEnvironmentSchema,
} from './environment-schemas.js';

export type {
  ApiEnvironment,
  BaseServiceEnvironment,
  DatabaseEnvironment,
  EmailEnvironment,
  SecurityEnvironment,
  SupabaseEnvironment,
  TrackerEnvironment,
  TrackingEnvironment,
  WorkerEnvironment,
} from './environment-schemas.js';

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface ConfigValidationIssue {
  code: string;
  message: string;
  path: string;
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return '<root>';
  }

  return path.map((segment) => String(segment)).join('.');
}

function createValidationErrorMessage(issues: readonly ConfigValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');

  return `Environment configuration validation failed: ${details}`;
}

export class ConfigValidationError extends Error {
  public readonly issues: readonly ConfigValidationIssue[];

  public constructor(issues: readonly ConfigValidationIssue[]) {
    const normalizedIssues = Object.freeze([...issues]);

    super(createValidationErrorMessage(normalizedIssues));

    this.name = 'ConfigValidationError';
    this.issues = normalizedIssues;
  }
}

export function parseEnvironment<TOutput>(
  schema: ZodType<TOutput>,
  environment: EnvironmentSource,
): TOutput {
  const result = schema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue): ConfigValidationIssue => ({
    code: issue.code,
    message: issue.message,
    path: formatIssuePath(issue.path),
  }));

  throw new ConfigValidationError(issues);
}
