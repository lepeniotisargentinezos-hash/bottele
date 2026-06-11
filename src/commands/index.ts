import { startCommand } from './start.command';
import { helpCommand } from './help.command';
import { overviewCommand } from './overview.command';
import { projectsCommand } from './projects.command';
import { statusCommand } from './status.command';
import { deploysCommand } from './deploys.command';
import { errorsCommand } from './errors.command';
import { analyticsCommand } from './analytics.command';
import { visitorsCommand } from './visitors.command';
import { performanceCommand } from './performance.command';
import { uptimeCommand } from './uptime.command';
import { reportCommand } from './report.command';
import { healthCommand } from './health.command';
import { settingsCommand } from './settings.command';
import { rollbackCommand } from './rollback.command';
import { logsCommand } from './logs.command';
import { checkCommand } from './check.command';
import { monitorCommand } from './monitor.command';
import type { BotCommand } from './types';

export type { BotCommand, CommandDependencies } from './types';

export const allCommands: BotCommand[] = [
  startCommand,
  helpCommand,
  overviewCommand,
  projectsCommand,
  statusCommand,
  deploysCommand,
  errorsCommand,
  analyticsCommand,
  visitorsCommand,
  performanceCommand,
  uptimeCommand,
  reportCommand,
  healthCommand,
  settingsCommand,
  rollbackCommand,
  logsCommand,
  checkCommand,
  monitorCommand,
];
