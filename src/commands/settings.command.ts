import { buildSettingsView } from '../bot/settings-view';
import type { BotCommand } from './types';

export const settingsCommand: BotCommand = {
  command: 'settings',
  description: 'Ajusta alertas e thresholds (menu interativo)',
  handler: async (ctx, deps) => {
    const settings = await deps.settings.getAlertSettings();
    const { text, keyboard } = buildSettingsView(settings);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  },
};
