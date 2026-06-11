import { describe, expect, it } from 'vitest';
import { average, growthPercent, percentile } from '../../src/utils/stats';

describe('percentile', () => {
  it('retorna 0 para lista vazia', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('retorna o próprio valor para lista unitária', () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it('calcula P50 (mediana) com interpolação', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it('calcula P95 de uma distribuição', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 95)).toBeCloseTo(95.05, 1);
  });

  it('P100 retorna o máximo e P0 o mínimo', () => {
    const values = [10, 5, 99, 1];
    expect(percentile(values, 100)).toBe(99);
    expect(percentile(values, 0)).toBe(1);
  });

  it('não modifica o array original', () => {
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('average', () => {
  it('retorna 0 para lista vazia', () => {
    expect(average([])).toBe(0);
  });

  it('calcula a média', () => {
    expect(average([100, 200, 300])).toBe(200);
  });
});

describe('growthPercent', () => {
  it('calcula crescimento positivo', () => {
    expect(growthPercent(150, 100)).toBe(50);
  });

  it('calcula queda', () => {
    expect(growthPercent(50, 100)).toBe(-50);
  });

  it('retorna null quando não há base de comparação', () => {
    expect(growthPercent(100, 0)).toBeNull();
  });

  it('retorna 0 quando ambos são zero', () => {
    expect(growthPercent(0, 0)).toBe(0);
  });
});
