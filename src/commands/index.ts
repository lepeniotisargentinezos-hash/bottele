import { startCommand } from './start.command';
import { helpCommand } from './help.command';
import { projectsCommand } from './projects.command';
import { statusCommand } from './status.command';
import { deploysCommand } from './deploys.command';
import { errorsCommand } from './errors.command';
import { performanceCommand } from './performance.command';
import { uptimeCommand } from './uptime.command';
import { reportCommand } from './report.command';
import { healthCommand } from './health.command';
import type { BotCommand } from './types';

export type { BotCommand, CommandDependencies } from './types';

export const allCommands: BotCommand[] = [
  startCommand,
  helpCommand,
  projectsCommand,
  statusCommand,
  deploysCommand,
  errorsCommand,
  performanceCommand,
  uptimeCommand,
  reportCommand,
  healthCommand,
];
