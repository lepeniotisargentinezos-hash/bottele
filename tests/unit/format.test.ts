import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatDuration,
  formatGrowth,
  formatMs,
  formatNumber,
  formatPercent,
  shortSha,
  truncateMessage,
} from '../../src/utils/format';

describe('escapeHtml', () => {
  it('escapa caracteres especiais de HTML', () => {
    expect(escapeHtml('<script>&"</script>')).toBe('&lt;script&gt;&amp;"&lt;/script&gt;');
  });

  it('mantém texto comum intacto', () => {
    expect(escapeHtml('projeto-abc')).toBe('projeto-abc');
  });
});

describe('truncateMessage', () => {
  it('não altera mensagens curtas', () => {
    expect(truncateMessage('oi')).toBe('oi');
  });

  it('trunca mensagens acima do limite do Telegram', () => {
    const long = 'a'.repeat(5000);
    const result = truncateMessage(long);
    expect(result.length).toBe(4096);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('formatNumber', () => {
  it('formata em pt-BR', () => {
    expect(formatNumber(12843)).toBe('12.843');
  });
});

describe('formatPercent', () => {
  it('usa vírgula decimal', () => {
    expect(formatPercent(99.98)).toBe('99,98%');
  });
});

describe('formatMs', () => {
  it('mostra milissegundos abaixo de 1s', () => {
    expect(formatMs(850)).toBe('850ms');
  });

  it('converte para segundos acima de 1s', () => {
    expect(formatMs(2500)).toBe('2,50s');
  });
});

describe('formatDuration', () => {
  it('formata durações curtas', () => {
    expect(formatDuration(30_000)).toBe('menos de 1 min');
  });

  it('formata minutos', () => {
    expect(formatDuration(12 * 60_000)).toBe('12 min');
  });

  it('formata horas e minutos', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h 30 min');
  });

  it('formata dias', () => {
    expect(formatDuration(25 * 60 * 60_000)).toBe('1d 1h');
  });
});

describe('formatGrowth', () => {
  it('indica crescimento', () => {
    expect(formatGrowth(12.34)).toBe('📈 +12,3%');
  });

  it('indica queda', () => {
    expect(formatGrowth(-5)).toBe('📉 -5,0%');
  });

  it('indica ausência de base', () => {
    expect(formatGrowth(null)).toBe('novo');
  });
});

describe('shortSha', () => {
  it('encurta o SHA', () => {
    expect(shortSha('abc1234def5678')).toBe('abc1234');
  });

  it('lida com valores ausentes', () => {
    expect(shortSha(null)).toBe('n/d');
  });
});
