/**
 * Mapa valor → etapa do funil CredPix (espelha o STEPS do site).
 * Usado para inferir, a partir do valor da venda, se foi a primeira
 * cobrança ou um upsell — já que o webhook do AnubisPay não traz a etapa.
 *
 * Em valores repetidos, o primeiro da lista vence (a etapa mais cedo no
 * funil, estatisticamente mais provável). Se os valores do site mudarem,
 * este mapa precisa ser atualizado.
 */
const STAGES: Array<{ cents: number; label: string }> = [
  { cents: 2990, label: 'Primeira Cobrança' },
  { cents: 3090, label: 'Upsell 1' },
  { cents: 2690, label: 'Upsell 2' },
  { cents: 1987, label: 'Upsell 3' },
  { cents: 3343, label: 'Upsell 4' },
  { cents: 1406, label: 'Upsell 6' },
  { cents: 1692, label: 'Upsell 7' },
  { cents: 3190, label: 'Upsell 8' },
  { cents: 1994, label: 'Upsell 10' },
  { cents: 1693, label: 'Upsell 11' },
  { cents: 1731, label: 'Upsell 13' },
  { cents: 1123, label: 'Upsell 14' },
  { cents: 1399, label: 'Upsell 15' },
  { cents: 887, label: 'Upsell 16' },
  { cents: 1582, label: 'Upsell 17' },
  { cents: 1697, label: 'Upsell 18' },
  { cents: 1719, label: 'Upsell 19' },
  { cents: 1990, label: 'Upsell 20' },
];

/** Infere a etapa do funil pelo valor (em centavos). Retorna null se desconhecido. */
export function inferSaleStage(amountCents: number): string | null {
  return STAGES.find((s) => s.cents === amountCents)?.label ?? null;
}
