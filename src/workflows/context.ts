import type { Repositories } from '@db/repositories';
import type { Telemetry } from '@telemetry/events';
import type { Providers } from '@providers/index';
import type { AppConfig } from '@server/config';

export interface WorkflowContext {
  repos: Repositories;
  telemetry: Telemetry;
  providers: Providers;
  config: AppConfig;
}

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}
