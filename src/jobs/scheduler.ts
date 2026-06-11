import cron, { type ScheduledTask } from 'node-cron';
import type { JobRegistry } from './job-registry';
import type { Logger } from '../utils/logger';

/** Agenda os jobs registrados usando expressões cron, respeitando o timezone configurado. */
export class Scheduler {
  private tasks: ScheduledTask[] = [];

  constructor(
    private readonly registry: JobRegistry,
    private readonly timezone: string,
    private readonly logger: Logger,
  ) {}

  start(): void {
    for (const { name, schedule } of this.registry.entries()) {
      const task = cron.schedule(schedule, () => void this.registry.run(name), {
        timezone: this.timezone,
      });
      this.tasks.push(task);
      this.logger.info({ job: name, schedule }, 'Job agendado');
    }
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    this.tasks = [];
    this.logger.info('Scheduler parado');
  }
}
