import { InlineKeyboard } from 'grammy';
import type { ProjectDetail } from '../services';
import type { Project } from '@prisma/client';
import { escapeHtml, formatBRL, formatDateTime, formatMs, formatNumber } from '../utils/format';

const STATE_ICONS: Record<string, string> = {
  READY: '✅',
  ERROR: '❌',
  CANCELED: '⚠️',
  BUILDING: '🔨',
  INITIALIZING: '⏳',
  QUEUED: '🕐',
};

/** Menu inicial do /painel: um botão por projeto (2 por linha). */
export function buildPanelMenu(projects: Project[]): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  projects.forEach((project, index) => {
    keyboard.text(project.name, `proj:${project.id}`);
    if (index % 2 === 1) keyboard.row();
  });
  return {
    text: '🗂️ <b>Painel de projetos</b>\n\nToque num domínio para ver todos os dados dele.',
    keyboard,
  };
}

/** Card detalhado de um projeto, com botões de ação. */
export function buildProjectCard(
  detail: ProjectDetail,
  timeZone: string,
): { text: string; keyboard: InlineKeyboard } {
  const statusIcon = detail.online === null ? '⚪' : detail.online ? '🟢' : '🔴';
  const statusLine =
    detail.online && detail.responseTimeMs !== null
      ? `${statusIcon} ${detail.statusDetail} · ${formatMs(detail.responseTimeMs)}`
      : `${statusIcon} ${escapeHtml(detail.statusDetail)}`;

  const lines: string[] = [`🌐 <b>${escapeHtml(detail.domain)}</b>`, statusLine];

  if (detail.gateway) {
    const g = detail.gateway;
    const label = !g.ok ? '⚠️ PIX FORA' : g.account ? escapeHtml(g.account) : 'ok';
    lines.push(`💳 Gateway: ${label}`);
  }

  if (detail.sslDaysRemaining !== null) {
    const warn = detail.sslDaysRemaining <= 14 ? ' ⚠️' : '';
    lines.push(`🔐 SSL: ${detail.sslDaysRemaining} dia(s)${warn}`);
  }

  lines.push(
    '',
    `👥 <b>Hoje:</b> ${formatNumber(detail.visitorsToday)} visitantes · ${formatNumber(detail.pageViewsToday)} views`,
    `👥 <b>7 dias:</b> ${formatNumber(detail.visitors7d)} visitantes · ${formatNumber(detail.pageViews7d)} views`,
    '',
    `💰 <b>Hoje:</b> ${formatBRL(detail.revenueCentsToday)} · ${detail.paidCountToday} venda(s)`,
    `💰 <b>7 dias:</b> ${formatBRL(detail.revenueCents7d)} · ${detail.paidCount7d} venda(s)`,
  );

  // Conversão visitante → venda (quando há visitantes no período).
  if (detail.visitors7d > 0) {
    const conv = (detail.paidCount7d / detail.visitors7d) * 100;
    lines.push(`📊 Conversão (7d): ${conv.toFixed(2).replace('.', ',')}%`);
  }

  if (detail.topPages.length > 0) {
    lines.push('', '📄 <b>Top páginas (7d)</b>');
    for (const page of detail.topPages) {
      lines.push(`• ${escapeHtml(page.label)} — ${formatNumber(page.count)}`);
    }
  }

  if (detail.recentDeploys.length > 0) {
    lines.push('', '🚀 <b>Últimos deploys</b>');
    for (const deploy of detail.recentDeploys.slice(0, 5)) {
      const icon = STATE_ICONS[deploy.state] ?? '❔';
      const branch = deploy.branch ? ` ${escapeHtml(deploy.branch)}` : '';
      lines.push(`${icon}${branch} · ${formatDateTime(deploy.createdAt, timeZone)}`);
    }
  }

  if (detail.envKeys.length > 0) {
    lines.push('', `⚙️ <b>Variáveis (${detail.envKeys.length})</b>`);
    lines.push(`<code>${escapeHtml(detail.envKeys.join(', '))}</code>`);
  }

  if (detail.openIncidents.length > 0) {
    lines.push('', '⚠️ <b>Incidentes abertos</b>');
    for (const incident of detail.openIncidents) lines.push(`🔴 ${escapeHtml(incident)}`);
  }

  const keyboard = new InlineKeyboard()
    .text('🔄 Atualizar', `proj:${detail.id}`)
    .text('⏪ Rollback', `rollback:${detail.id}`)
    .row();
  const siteUrl =
    detail.productionUrl ?? (detail.domain.includes('.') ? `https://${detail.domain}` : null);
  if (siteUrl) keyboard.url('🌐 Abrir site', siteUrl).row();
  keyboard.text('⬅️ Voltar', 'painel');

  return { text: lines.join('\n'), keyboard };
}
