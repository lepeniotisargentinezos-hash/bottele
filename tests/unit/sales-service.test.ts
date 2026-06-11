import { describe, expect, it, vi } from 'vitest';
import { SalesService } from '../../src/services/sales.service';
import { logger } from '../../src/utils/logger';

function build(previousStatus: string | null = null) {
  const sales = {
    upsert: vi.fn().mockResolvedValue({ sale: {}, previousStatus }),
    totals: vi.fn(),
    revenueByProject: vi.fn(),
  };
  const projects = {
    findAllActive: vi.fn().mockResolvedValue([
      {
        id: 'p1',
        name: 'creditofacilonline.lol',
        domains: ['creditofacilonline.lol', 'credpix-7.vercel.app'],
        productionUrl: 'https://credpix-7.vercel.app',
      },
    ]),
  };
  return { service: new SalesService(sales as never, projects as never, logger), sales, projects };
}

// Payload real do webhook AnubisPay (formato da doc).
const paidEvent = {
  Id: 'a24207e615224923bf4a68265d519fc6',
  ExternalId: '27615041',
  Amount: 100, // em reais
  Status: 'PAID',
  PaymentMethod: 'pix',
  PostbackUrl: 'https://www.creditofacilonline.lol/api/postback/anubispay',
  UpdatedAt: '2025-11-05T21:19:42.3648396',
  PaidAt: '2025-11-05T21:20:00',
};

describe('SalesService.ingest', () => {
  it('registra a venda, converte reais→centavos e atribui ao site pelo PostbackUrl', async () => {
    const { service, sales } = build('pending');
    const result = await service.ingest(paidEvent);

    expect(result.ok).toBe(true);
    expect(result.becamePaid).toBe(true);
    expect(result.amountCents).toBe(10000); // R$100 → 10000 centavos
    expect(result.projectName).toBe('creditofacilonline.lol');

    const input = sales.upsert.mock.calls[0][0];
    expect(input).toMatchObject({
      id: 'a24207e615224923bf4a68265d519fc6',
      projectId: 'p1',
      site: 'creditofacilonline.lol',
      status: 'paid',
      amountCents: 10000,
    });
  });

  it('não marca becamePaid se já estava paga (evita alerta duplicado)', async () => {
    const { service } = build('paid');
    const result = await service.ingest(paidEvent);
    expect(result.becamePaid).toBe(false);
  });

  it('não marca becamePaid para status pendente', async () => {
    const { service } = build(null);
    const result = await service.ingest({ ...paidEvent, Status: 'PENDING' });
    expect(result.becamePaid).toBe(false);
  });

  it('registra mesmo sem casar com um projeto (projectId null)', async () => {
    const { service, sales } = build(null);
    await service.ingest({ ...paidEvent, PostbackUrl: 'https://desconhecido.com/x' });
    const input = sales.upsert.mock.calls[0][0];
    expect(input.projectId).toBeNull();
    expect(input.site).toBe('desconhecido.com');
  });

  it('ignora evento sem Id', async () => {
    const { service, sales } = build(null);
    const result = await service.ingest({ Amount: 50, Status: 'PAID' });
    expect(result.ok).toBe(false);
    expect(sales.upsert).not.toHaveBeenCalled();
  });

  it('delega consultas de receita ao repositório', async () => {
    const { service, sales } = build(null);
    sales.totals.mockResolvedValue({ paidCount: 1, totalCount: 2, revenueCents: 2990 });
    sales.revenueByProject.mockResolvedValue([
      { projectId: 'p1', revenueCents: 2990, paidCount: 1 },
    ]);

    const from = new Date(0);
    const to = new Date();
    expect(await service.totals(from, to, 'p1')).toEqual({
      paidCount: 1,
      totalCount: 2,
      revenueCents: 2990,
    });
    expect(await service.revenueByProject(from, to)).toHaveLength(1);
    expect(sales.totals).toHaveBeenCalledWith(from, to, 'p1');
  });
});
