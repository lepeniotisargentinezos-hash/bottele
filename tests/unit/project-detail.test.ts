import { describe, expect, it, vi } from 'vitest';
import { ProjectDetailService } from '../../src/services/project-detail.service';
import { buildProjectCard, buildPanelMenu } from '../../src/bot/project-detail-view';
import { logger } from '../../src/utils/logger';

function buildService() {
  const vercel = {
    listProjectEnvKeys: vi.fn().mockResolvedValue(['ANUBISPAY_PUBLIC_KEY', 'ANUBISPAY_SECRET_KEY']),
  };
  const projects = {
    findById: vi.fn().mockResolvedValue({
      id: 'p1',
      name: 'creditoaprova.xyz',
      domains: ['creditoaprova.xyz', 'credpix-6.vercel.app'],
      productionUrl: 'https://credpix-6.vercel.app',
    }),
  };
  const deployments = {
    findRecentByProject: vi
      .fn()
      .mockResolvedValue([
        { state: 'READY', branch: 'main', vercelCreatedAt: new Date('2026-06-11T08:00:00Z') },
      ]),
  };
  const incidents = { listOpen: vi.fn().mockResolvedValue([]) };
  const uptime = {
    recheckProject: vi
      .fn()
      .mockResolvedValue([{ success: true, statusCode: 200, responseTimeMs: 97, reason: null }]),
  };
  const performance = {};
  const analytics = {
    totals: vi
      .fn()
      .mockResolvedValueOnce({ visitors: 9, pageViews: 15 })
      .mockResolvedValueOnce({ visitors: 60, pageViews: 130 }),
    topPages: vi.fn().mockResolvedValue([{ label: '/', count: 100 }]),
  };
  const externalMonitor = {
    inspect: vi
      .fn()
      .mockResolvedValue([
        { name: 'pix-x', host: 'creditoaprova.xyz', ok: true, account: 'Conta 2' },
      ]),
  };
  const ssl = {
    statusForAll: vi
      .fn()
      .mockResolvedValue([
        { project: 'creditoaprova.xyz', hostname: 'creditoaprova.xyz', daysRemaining: 45 },
      ]),
  };

  const service = new ProjectDetailService(
    vercel as never,
    projects as never,
    deployments as never,
    incidents as never,
    uptime as never,
    performance as never,
    analytics as never,
    externalMonitor as never,
    ssl as never,
    logger,
  );
  return { service };
}

describe('ProjectDetailService', () => {
  it('agrega todos os dados de um projeto', async () => {
    const { service } = buildService();
    const detail = await service.build('p1');

    expect(detail).not.toBeNull();
    expect(detail?.domain).toBe('creditoaprova.xyz');
    expect(detail?.online).toBe(true);
    expect(detail?.responseTimeMs).toBe(97);
    expect(detail?.gateway).toEqual({ ok: true, account: 'Conta 2' });
    expect(detail?.sslDaysRemaining).toBe(45);
    expect(detail?.visitorsToday).toBe(9);
    expect(detail?.visitors7d).toBe(60);
    expect(detail?.envKeys).toContain('ANUBISPAY_SECRET_KEY');
    expect(detail?.recentDeploys).toHaveLength(1);
  });

  it('retorna null para projeto inexistente', async () => {
    const vercel = { listProjectEnvKeys: vi.fn() };
    const projects = { findById: vi.fn().mockResolvedValue(null) };
    const service = new ProjectDetailService(
      vercel as never,
      projects as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      logger,
    );
    expect(await service.build('inexistente')).toBeNull();
  });

  it('lida com projeto sem URL, sem gateway, sem SSL e com incidente', async () => {
    const vercel = {
      listProjectEnvKeys: vi.fn().mockRejectedValue(new Error('sem acesso')),
    };
    const projects = {
      findById: vi.fn().mockResolvedValue({
        id: 'p9',
        name: 'arthlens',
        domains: ['arthlens.vercel.app'],
        productionUrl: 'https://arthlens.vercel.app',
      }),
    };
    const deployments = { findRecentByProject: vi.fn().mockResolvedValue([]) };
    const incidents = {
      listOpen: vi.fn().mockResolvedValue([{ projectId: 'p9', reason: null, type: 'DOWNTIME' }]),
    };
    const uptime = { recheckProject: vi.fn().mockResolvedValue([]) };
    const analytics = {
      totals: vi.fn().mockResolvedValue({ visitors: 0, pageViews: 0 }),
      topPages: vi.fn().mockResolvedValue([]),
    };
    const externalMonitor = { inspect: vi.fn().mockResolvedValue([]) };
    const ssl = { statusForAll: vi.fn().mockResolvedValue([]) };

    const service = new ProjectDetailService(
      vercel as never,
      projects as never,
      deployments as never,
      incidents as never,
      uptime as never,
      {} as never,
      analytics as never,
      externalMonitor as never,
      ssl as never,
      logger,
    );

    const detail = await service.build('p9');
    expect(detail?.online).toBeNull();
    expect(detail?.statusDetail).toBe('sem URL monitorável');
    expect(detail?.gateway).toBeNull();
    expect(detail?.sslDaysRemaining).toBeNull();
    expect(detail?.responseTimeMs).toBeNull();
    expect(detail?.envKeys).toEqual([]); // falha no listProjectEnvKeys degrada para []
    expect(detail?.openIncidents).toEqual(['DOWNTIME']); // reason null → usa o type
    // Domínio cai para o .vercel.app quando não há custom domain.
    expect(detail?.domain).toBe('arthlens.vercel.app');
  });
});

describe('buildPanelMenu', () => {
  it('cria um botão por projeto', () => {
    const projects = [
      { id: 'p1', name: 'site-a' },
      { id: 'p2', name: 'site-b' },
    ];
    const { text, keyboard } = buildPanelMenu(projects as never);
    expect(text).toContain('Painel de projetos');
    const buttons = keyboard.inline_keyboard.flat();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.text).toBe('site-a');
  });
});

describe('buildProjectCard', () => {
  it('monta o card com dados e botões de ação', () => {
    const detail = {
      id: 'p1',
      name: 'site-a',
      domain: 'site-a.com',
      productionUrl: 'https://site-a.com',
      online: true,
      statusDetail: 'no ar',
      responseTimeMs: 100,
      gateway: { ok: true, account: 'Conta 1' },
      sslDaysRemaining: 30,
      visitorsToday: 10,
      pageViewsToday: 20,
      visitors7d: 70,
      pageViews7d: 140,
      topPages: [{ label: '/', count: 50 }],
      recentDeploys: [
        { state: 'READY' as const, branch: 'main', createdAt: new Date('2026-06-11T08:00:00Z') },
      ],
      openIncidents: [],
      envKeys: ['ANUBISPAY_PUBLIC_KEY'],
    };
    const { text, keyboard } = buildProjectCard(detail, 'America/Sao_Paulo');

    expect(text).toContain('site-a.com');
    expect(text).toContain('💳 Gateway: Conta 1');
    expect(text).toContain('🔐 SSL: 30');
    expect(text).toContain('Top páginas');
    expect(text).toContain('ANUBISPAY_PUBLIC_KEY');
    // Botões: Atualizar, Rollback, Abrir site, Voltar.
    const labels = keyboard.inline_keyboard.flat().map((b) => b.text);
    expect(labels).toContain('🔄 Atualizar');
    expect(labels).toContain('⏪ Rollback');
    expect(labels).toContain('⬅️ Voltar');
  });

  it('mostra gateway fora e omite seções vazias quando offline', () => {
    const detail = {
      id: 'p2',
      name: 'site-b',
      domain: 'site-b.com',
      productionUrl: null,
      online: false,
      statusDetail: 'HTTP 503',
      responseTimeMs: null,
      gateway: { ok: false, account: 'Conta 2' },
      sslDaysRemaining: null,
      visitorsToday: 0,
      pageViewsToday: 0,
      visitors7d: 0,
      pageViews7d: 0,
      topPages: [],
      recentDeploys: [],
      openIncidents: ['DOWNTIME'],
      envKeys: [],
    };
    const { text, keyboard } = buildProjectCard(detail, 'America/Sao_Paulo');

    expect(text).toContain('🔴 HTTP 503');
    expect(text).toContain('💳 Gateway: ⚠️ PIX FORA');
    expect(text).toContain('Incidentes abertos');
    expect(text).not.toContain('Top páginas');
    expect(text).not.toContain('SSL');
    // Sem productionUrl mas domínio com ponto → botão "Abrir site" ainda aparece.
    const labels = keyboard.inline_keyboard.flat().map((b) => b.text);
    expect(labels).toContain('🌐 Abrir site');
  });
});
