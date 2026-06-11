import { describe, expect, it, vi } from 'vitest';
import { VercelClient } from '../../src/integrations/vercel/client';
import { VercelApiError } from '../../src/utils/errors';
import { logger } from '../../src/utils/logger';
import { jsonResponse } from '../mocks/vercel.fixtures';

function createClient(fetchFn: typeof fetch): VercelClient {
  return new VercelClient({ token: 'test-token', logger, fetchFn });
}

describe('VercelClient — casos adicionais', () => {
  it('respeita o header retry-after em respostas 429', async () => {
    const rateLimited = new Response('{}', {
      status: 429,
      headers: { 'retry-after': '0' },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(jsonResponse({ user: {} }));
    const client = createClient(fetchMock as unknown as typeof fetch);

    expect(await client.ping()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lança VercelApiError após esgotar retries de rede', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(client.getDeployment('dpl_x')).rejects.toBeInstanceOf(VercelApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ping retorna false quando as credenciais são inválidas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    const client = createClient(fetchMock as unknown as typeof fetch);

    expect(await client.ping()).toBe(false);
  });

  it('listProjectDomains retorna apenas domínios verificados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        domains: [
          { name: 'app.example.com', verified: true },
          { name: 'pendente.example.com', verified: false },
        ],
      }),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    expect(await client.listProjectDomains('prj_1')).toEqual(['app.example.com']);
  });

  it('getDeploymentErrorReason usa as últimas linhas de log como fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { type: 'stdout', created: 1, payload: { text: 'compilando...' } },
        { type: 'stderr', created: 2, payload: { text: 'warning: algo' } },
      ]),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    const reason = await client.getDeploymentErrorReason('dpl_x');
    expect(reason).toContain('compilando...');
    expect(reason).toContain('warning: algo');
  });

  it('getDeploymentErrorReason retorna null quando os eventos falham', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'nf' }, 404));
    const client = createClient(fetchMock as unknown as typeof fetch);

    expect(await client.getDeploymentErrorReason('dpl_x')).toBeNull();
  });

  it('getWebAnalytics propaga erros não relacionados a permissão', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'down' }, 503));
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(client.getWebAnalytics('prj_1', new Date(0), new Date())).rejects.toBeInstanceOf(
      VercelApiError,
    );
  });
});
