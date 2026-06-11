import type { JobStatus } from '../types';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

export type JobHandler = () => Promise<void>;

interface RegisteredJob {
  name: string;
  schedule: string;
  handler: JobHandler;
  status: JobStatus;
}

/**
 * Registro central de jobs: evita execuções sobrepostas,
 * captura erros e expõe o estado de cada job para o /health.
 */
export class JobRegistry {
  private readonly jobs = new Map<string, RegisteredJob>();

  constructor(private readonly logger: Logger) {}

  register(name: string, schedule: string, handler: JobHandler): void {
    this.jobs.set(name, {
      name,
      schedule,
      handler,
      status: {
        name,
        schedule,
        lastRunAt: null,
        lastSuccessAt: null,
        lastError: null,
        running: false,
        runs: 0,
        failures: 0,
      },
    });
  }

  async run(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      this.logger.warn({ job: name }, 'Job não registrado');
      return;
    }
    if (job.status.running) {
      this.logger.warn({ job: name }, 'Job ainda em execução; pulando esta rodada');
      return;
    }

    job.status.running = true;
    job.status.lastRunAt = new Date();
    job.status.runs++;

    const startedAt = Date.now();
    try {
      await job.handler();
      job.status.lastSuccessAt = new Date();
      job.status.lastError = null;
      this.logger.debug({ job: name, durationMs: Date.now() - startedAt }, 'Job concluído');
    } catch (error) {
      job.status.failures++;
      job.status.lastError = toErrorMessage(error);
      this.logger.error({ job: name, error: job.status.lastError }, 'Job falhou');
    } finally {
      job.status.running = false;
    }
  }

  list(): JobStatus[] {
    return [...this.jobs.values()].map((job) => ({ ...job.status }));
  }

  entries(): Array<{ name: string; schedule: string }> {
    return [...this.jobs.values()].map((job) => ({ name: job.name, schedule: job.schedule }));
  }
}
