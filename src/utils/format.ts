const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncateMessage(text: string, max = TELEGRAM_MAX_MESSAGE_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

/** Formata centavos em reais: 2990 → "R$ 29,90". */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace('.', ',')}s`;
  return `${Math.round(value)}ms`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'menos de 1 min';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} min`);
  return parts.join(' ');
}

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone,
  }).format(date);
}

export function formatGrowth(growth: number | null): string {
  if (growth === null) return 'novo';
  const arrow = growth > 0 ? '📈' : growth < 0 ? '📉' : '➡️';
  const sign = growth > 0 ? '+' : '';
  return `${arrow} ${sign}${growth.toFixed(1).replace('.', ',')}%`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : 'n/d';
}
