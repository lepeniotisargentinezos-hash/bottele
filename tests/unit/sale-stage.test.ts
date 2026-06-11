import { describe, expect, it } from 'vitest';
import { inferSaleStage } from '../../src/utils/sale-stage';

describe('inferSaleStage', () => {
  it('identifica a primeira cobrança (R$29,90)', () => {
    expect(inferSaleStage(2990)).toBe('Primeira Cobrança');
  });

  it('identifica upsells por valores únicos', () => {
    expect(inferSaleStage(3090)).toBe('Upsell 1');
    expect(inferSaleStage(1987)).toBe('Upsell 3');
    expect(inferSaleStage(1990)).toBe('Upsell 20');
  });

  it('em valor ambíguo, escolhe a etapa mais cedo no funil', () => {
    // 2690 = Upsell 2 ou Upsell 9 → prioriza o 2.
    expect(inferSaleStage(2690)).toBe('Upsell 2');
  });

  it('retorna null para valor desconhecido', () => {
    expect(inferSaleStage(12345)).toBeNull();
  });
});
