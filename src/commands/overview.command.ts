import { escapeHtml, formatMs, formatNumber } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./, '').toLowerCase();
}

/**
 * Domínio de exibição: prefere um domínio custom (não *.vercel.app);
 * cai para o nome do projeto quando ele já é um domínio; por fim, a URL.
 */
function displayDomain(project: {
  name: string;
  domains: string[];
  productionUrl: string | null;
}): string {
  const custom = project.domains.find((d) => !d.endsWith('.vercel.app'));
  if (custom) return custom;
  if (project.name.includes('.')) return project.name;
  return project.productionUrl ? stripScheme(project.productionUrl) : project.name;
}

/** Rótulo do gateway de pagamento: ok, fora, ou ausente (não monitorado). */
function gatewayLabel(gateway: boolean | null): string {
  if (gateway === null) return '';
  return gateway ? ' · 💳 ok' : ' · 💳 ⚠️ PIX FORA';
}

interface Row {
  domain: string;
  online: boolean | null;
  detail: string;
  visitors: number;
  pageViews: number;
  gateway: boolean | null;
}

export const overviewCommand: BotCommand = {
  command: 'overview',
  description: 'Painel geral: status, gateway, domínios e visitantes',
  handler: async (ctx, deps) => {
    await ctx.replyWithChatAction('typing');

    const now = new Date();
    const todayStart = new Date(now.getTime() - DAY_MS);

    const [projects, statuses, gateways, byProject, todayGlobal, openIncidents] = await Promise.all(
      [
        deps.projects.findAllActive(),
        deps.uptime.liveStatusAll(),
        deps.externalMonitor.liveStatus(),
        deps.analytics.totalsByProject(todayStart, now),
        deps.analytics.totals(todayStart, now),
        deps.incidents.countOpen(),
      ],
    );

    const statusByName = new Map(statuses.map((s) => [s.name, s]));
    const analyticsByProject = new Map(byProject.map((b) => [b.projectId, b]));

    // Indexa o status do gateway por host (sem www) extraído da URL do monitor.
    const gatewayByHost = new Map<string, boolean>();
    for (const g of gateways) {
      try {
        gatewayByHost.set(normalizeHost(new URL(g.url).hostname), g.result.success);
      } catch {
        // URL malformada — ignora.
      }
    }

    const findGateway = (project: {
      name: string;
      domains: string[];
      productionUrl: string | null;
    }): boolean | null => {
      const candidates = [displayDomain(project), project.name, ...project.domains]
        .filter(Boolean)
        .map(normalizeHost);
      for (const candidate of candidates) {
        const hit = gatewayByHost.get(candidate);
        if (hit !== undefined) return hit;
      }
      return null;
    };

    const rows: Row[] = projects.map((project) => {
      const status = statusByName.get(project.name);
      const stats = analyticsByProject.get(project.id);
      const online = status ? status.result.success : null;
      const detail = !status
        ? 'sem URL monitorável'
        : status.result.success
          ? formatMs(status.result.responseTimeMs)
          : (status.result.reason ?? `HTTP ${status.result.statusCode ?? '?'}`);
      return {
        domain: displayDomain(project),
        online,
        detail,
        visitors: stats?.visitors ?? 0,
        pageViews: stats?.pageViews ?? 0,
        gateway: findGateway(project),
      };
    });

    rows.sort((a, b) => {
      if (a.online !== b.online) return a.online === false ? -1 : b.online === false ? 1 : 0;
      return b.visitors - a.visitors;
    });

    const onlineCount = rows.filter((r) => r.online === true).length;
    const monitored = rows.filter((r) => r.online !== null).length;
    const gatewaysDown = rows.filter((r) => r.gateway === false).length;
    const headerIcon = onlineCount === monitored && gatewaysDown === 0 ? '🟢' : '🔴';

    const offline = rows.filter((r) => r.online === false);
    const withTraffic = rows.filter(
      (r) => r.online !== false && (r.visitors > 0 || r.pageViews > 0),
    );
    const idle = rows.filter((r) => r.online !== false && r.visitors === 0 && r.pageViews === 0);

    const lines: string[] = [
      '📊 <b>OVERVIEW GERAL</b>',
      `${headerIcon} ${onlineCount}/${monitored} online${openIncidents > 0 ? ` · ⚠️ ${openIncidents} incidente(s)` : ''}`,
    ];
    if (gatewaysDown > 0) lines.push(`💳 ⚠️ <b>${gatewaysDown} gateway(s) PIX fora</b>`);
    lines.push(
      `👥 Hoje: <b>${formatNumber(todayGlobal.visitors)}</b> visitantes · ${formatNumber(todayGlobal.pageViews)} views`,
    );

    if (offline.length > 0) {
      lines.push('', '🔴 <b>FORA DO AR</b>');
      for (const row of offline) {
        lines.push(`🔴 <b>${escapeHtml(row.domain)}</b>`, `   ⚠️ ${escapeHtml(row.detail)}`);
      }
    }

    if (withTraffic.length > 0) {
      lines.push('', '📈 <b>COM TRÁFEGO HOJE</b>');
      for (const row of withTraffic) {
        lines.push(
          `🟢 <b>${escapeHtml(row.domain)}</b> · ${escapeHtml(row.detail)}${gatewayLabel(row.gateway)}`,
          `   👥 ${formatNumber(row.visitors)} visitantes · ${formatNumber(row.pageViews)} views`,
        );
      }
    }

    if (idle.length > 0) {
      lines.push('', '🟢 <b>SEM ACESSOS HOJE</b>');
      for (const row of idle) {
        const icon = row.online === null ? '⚪' : '🟢';
        lines.push(
          `${icon} ${escapeHtml(row.domain)} · ${escapeHtml(row.detail)}${gatewayLabel(row.gateway)}`,
        );
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  },
};
