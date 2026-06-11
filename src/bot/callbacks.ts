import { InlineKeyboard, type Bot, type Context } from 'grammy';
import type { CommandDependencies } from '../commands';
import { buildSettingsView, THRESHOLD_CODES, THRESHOLD_STEP_MS } from './settings-view';
import { escapeHtml, formatMs } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { AlertSettings } from '../types';

const MIN_THRESHOLD_MS = 500;

/**
 * Roteia os cliques nos botões inline (callback queries).
 * Formato do callback_data: `action:arg1:arg2`.
 */
export function registerCallbacks(bot: Bot, deps: CommandDependencies): void {
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [action, ...rest] = data.split(':');

    try {
      switch (action) {
        case 'redeploy':
          await handleRedeploy(ctx, deps, rest[0]);
          break;
        case 'logs':
          await handleLogs(ctx, deps, rest[0]);
          break;
        case 'recheck':
          await handleRecheck(ctx, deps, rest[0]);
          break;
        case 'rollback':
          await handleRollbackConfirm(ctx, rest[0]);
          break;
        case 'rollbackok':
          await handleRollback(ctx, deps, rest[0]);
          break;
        case 'cfg':
          await handleConfig(ctx, deps, rest);
          break;
        default:
          await ctx.answerCallbackQuery();
      }
    } catch (error) {
      deps.logger.error({ data, error: toErrorMessage(error) }, 'Erro ao tratar callback');
      await ctx.answerCallbackQuery({ text: 'Erro ao processar ação.', show_alert: true });
    }
  });
}

async function handleRedeploy(
  ctx: Context,
  deps: CommandDependencies,
  deploymentId?: string,
): Promise<void> {
  if (!deploymentId) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Disparando redeploy...' });
  const result = await deps.deployActions.redeploy(deploymentId);
  await ctx.reply(result.message, { parse_mode: 'HTML' });
}

async function handleLogs(
  ctx: Context,
  deps: CommandDependencies,
  deploymentId?: string,
): Promise<void> {
  if (!deploymentId) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Buscando logs...' });
  const logs = await deps.deployActions.getLogs(deploymentId);
  if (!logs) {
    await ctx.reply('Logs indisponíveis para este deployment.');
    return;
  }
  await ctx.reply(
    `📜 <b>Últimas linhas do build</b>\n<pre>${escapeHtml(logs.slice(0, 3500))}</pre>`,
    {
      parse_mode: 'HTML',
    },
  );
}

async function handleRecheck(
  ctx: Context,
  deps: CommandDependencies,
  projectId?: string,
): Promise<void> {
  if (!projectId) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Verificando agora...' });
  const results = await deps.uptime.recheckProject(projectId);
  if (results.length === 0) {
    await ctx.reply('Projeto sem URL monitorável.');
    return;
  }
  const lines = results.map((r) => {
    const icon = r.success ? '🟢' : '🔴';
    const detail = r.success
      ? `${r.statusCode} · ${formatMs(r.responseTimeMs)}`
      : (r.reason ?? 'falha');
    return `${icon} ${escapeHtml(r.url)} — ${escapeHtml(String(detail))}`;
  });
  await ctx.reply(['🔍 <b>Re-checagem</b>', '', ...lines].join('\n'), { parse_mode: 'HTML' });
}

async function handleRollbackConfirm(ctx: Context, projectId?: string): Promise<void> {
  if (!projectId) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard().text('✅ Confirmar rollback', `rollbackok:${projectId}`);
  await ctx.reply('⚠️ Reverter a produção para o deployment anterior?', { reply_markup: keyboard });
}

async function handleRollback(
  ctx: Context,
  deps: CommandDependencies,
  projectId?: string,
): Promise<void> {
  if (!projectId) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Revertendo...' });
  const result = await deps.deployActions.rollback(projectId);
  await ctx.reply(result.message, { parse_mode: 'HTML' });
}

async function handleConfig(
  ctx: Context,
  deps: CommandDependencies,
  rest: string[],
): Promise<void> {
  const [sub, arg, dir] = rest;

  if (sub === 'noop') {
    await ctx.answerCallbackQuery();
    return;
  }

  if (sub === 'toggle' && arg) {
    const current = await deps.settings.getAlertSettings();
    const key = arg as keyof AlertSettings;
    if (typeof current[key] === 'boolean') {
      await deps.settings.updateAlertSettings({ [key]: !current[key] } as Partial<AlertSettings>);
    }
    await ctx.answerCallbackQuery({ text: 'Atualizado' });
    await refreshSettingsView(ctx, deps);
    return;
  }

  if (sub === 'thr' && arg && dir) {
    const key = THRESHOLD_CODES[arg];
    if (key) {
      const current = await deps.settings.getAlertSettings();
      const value = current[key] as number;
      const next =
        dir === 'up'
          ? value + THRESHOLD_STEP_MS
          : Math.max(MIN_THRESHOLD_MS, value - THRESHOLD_STEP_MS);
      await deps.settings.updateAlertSettings({ [key]: next } as Partial<AlertSettings>);
    }
    await ctx.answerCallbackQuery({ text: 'Atualizado' });
    await refreshSettingsView(ctx, deps);
    return;
  }

  await ctx.answerCallbackQuery();
}

async function refreshSettingsView(ctx: Context, deps: CommandDependencies): Promise<void> {
  const settings = await deps.settings.getAlertSettings();
  const { text, keyboard } = buildSettingsView(settings);
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } catch {
    // Edição falha se a mensagem não mudou — ignorável.
  }
}
