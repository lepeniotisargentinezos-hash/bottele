import { describe, expect, it } from 'vitest';
import { latencyChartUrl } from '../../src/utils/charts';
import type { PerformanceStats } from '../../src/types';

const stat = (over: Partial<PerformanceStats>): PerformanceStats => ({
  projectId: 'prj_1',
  projectName: 'app',
  url: null,
  samples: 10,
  avgMs: 300,
  p95Ms: 800,
  p99Ms: 1200,
  ...over,
});

describe('latencyChartUrl', () => {
  it('retorna null sem dados', () => {
    expect(latencyChartUrl([])).toBeNull();
    expect(latencyChartUrl([stat({ samples: 0 })])).toBeNull();
  });

  it('gera URL do QuickChart com os projetos', () => {
    const url = latencyChartUrl([stat({ projectName: 'dashboard' })]);
    expect(url).toContain('https://quickchart.io/chart');
    const config = decodeURIComponent(new URL(url!).searchParams.get('c')!);
    expect(config).toContain('dashboard');
    expect(config).toContain('P95 (ms)');
  });

  it('limita a quantidade de projetos no gráfico', () => {
    const many = Array.from({ length: 20 }, (_, i) => stat({ projectName: `p${i}` }));
    const url = latencyChartUrl(many, 5);
    const config = JSON.parse(decodeURIComponent(new URL(url!).searchParams.get('c')!));
    expect(config.data.labels).toHaveLength(5);
  });
});
