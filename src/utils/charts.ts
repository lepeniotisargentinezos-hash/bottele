import type { PerformanceStats } from '../types';

const QUICKCHART_BASE = 'https://quickchart.io/chart';

/**
 * Gera a URL de um gráfico de barras (QuickChart) com a latência média e o P95
 * por projeto. QuickChart renderiza a imagem a partir da config Chart.js na query
 * string — sem dependências locais. Retorna null se não houver dados.
 */
export function latencyChartUrl(stats: PerformanceStats[], maxProjects = 12): string | null {
  const data = stats.filter((s) => s.samples > 0).slice(0, maxProjects);
  if (data.length === 0) return null;

  const config = {
    type: 'bar',
    data: {
      labels: data.map((s) => s.projectName),
      datasets: [
        { label: 'Média (ms)', data: data.map((s) => Math.round(s.avgMs)) },
        { label: 'P95 (ms)', data: data.map((s) => Math.round(s.p95Ms)) },
      ],
    },
    options: {
      title: { display: true, text: 'Latência por projeto (24h)' },
      legend: { position: 'bottom' },
    },
  };

  const params = new URLSearchParams({
    c: JSON.stringify(config),
    w: '600',
    h: '400',
    bkg: 'white',
    devicePixelRatio: '2',
  });
  return `${QUICKCHART_BASE}?${params.toString()}`;
}
