import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchHttpChecker } from '../../src/services/uptime.service';

describe('FetchHttpChecker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('considera 200 como sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const checker = new FetchHttpChecker();

    const result = await checker.check('https://example.com', 5000);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.errorType).toBeNull();
  });

  it('considera 404 como sucesso (site responde, não é erro de servidor)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nf', { status: 404 })));
    const checker = new FetchHttpChecker();

    const result = await checker.check('https://example.com', 5000);
    expect(result.success).toBe(true);
  });

  it.each([500, 502, 503, 504])('detecta HTTP %i como falha', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status })));
    const checker = new FetchHttpChecker();

    const result = await checker.check('https://example.com', 5000);

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('HTTP_ERROR');
    expect(result.reason).toBe(`HTTP ${status}`);
  });

  it('detecta timeout', async () => {
    const timeoutError = new Error('aborted');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));
    const checker = new FetchHttpChecker();

    const result = await checker.check('https://example.com', 100);

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('TIMEOUT');
  });

  it('detecta DNS inválido', async () => {
    const cause = new Error('getaddrinfo ENOTFOUND nao-existe.example');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed', { cause })));
    const checker = new FetchHttpChecker();

    const result = await checker.check('https://nao-existe.example', 5000);

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('DNS_ERROR');
  });
});
