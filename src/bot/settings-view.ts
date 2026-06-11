import { InlineKeyboard } from 'grammy';
import type { AlertSettings } from '../types';
import { formatMs } from '../utils/format';

interface ToggleDef {
  key: keyof AlertSettings;
  label: string;
}

const TOGGLES: ToggleDef[] = [
  { key: 'deployFailures', label: 'Falhas de deploy' },
  { key: 'deploySuccess', label: 'Deploys concluídos' },
  { key: 'downtime', label: 'Site fora do ar' },
  { key: 'performance', label: 'Performance' },
  { key: 'newProjects', label: 'Novos projetos' },
];

const THRESHOLDS: Array<{ key: keyof AlertSettings; label: string }> = [
  { key: 'latencyThresholdMs', label: 'Latência média' },
  { key: 'p95ThresholdMs', label: 'P95' },
  { key: 'p99ThresholdMs', label: 'P99' },
];

/** Códigos curtos usados no callback_data (limite de 64 bytes do Telegram). */
export const THRESHOLD_CODES: Record<string, keyof AlertSettings> = {
  lat: 'latencyThresholdMs',
  p95: 'p95ThresholdMs',
  p99: 'p99ThresholdMs',
};

const CODE_BY_KEY = Object.fromEntries(
  Object.entries(THRESHOLD_CODES).map(([code, key]) => [key, code]),
) as Record<string, string>;

/** Passo de ajuste dos thresholds (ms). */
export const THRESHOLD_STEP_MS = 500;

export function buildSettingsView(settings: AlertSettings): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const keyboard = new InlineKeyboard();

  for (const toggle of TOGGLES) {
    const on = settings[toggle.key] as boolean;
    keyboard.text(`${on ? '✅' : '❌'} ${toggle.label}`, `cfg:toggle:${toggle.key}`).row();
  }

  for (const threshold of THRESHOLDS) {
    const value = settings[threshold.key] as number;
    const code = CODE_BY_KEY[threshold.key];
    keyboard
      .text('➖', `cfg:thr:${code}:down`)
      .text(`${threshold.label}: ${formatMs(value)}`, 'cfg:noop')
      .text('➕', `cfg:thr:${code}:up`)
      .row();
  }

  const text = [
    '⚙️ <b>Configurações de alerta</b>',
    '',
    'Toque para ligar/desligar cada alerta ou ajustar os limites de performance.',
  ].join('\n');

  return { text, keyboard };
}
