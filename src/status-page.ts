import { escapeHtml, formatPercent } from './utils/format';

export interface ProjectStatusRow {
  name: string;
  up: boolean;
  uptimePercent: number;
}

/** Renderiza uma status page pública e estática (sem dependências de front-end). */
export function renderStatusPage(rows: ProjectStatusRow[], generatedAtIso: string): string {
  const allUp = rows.every((r) => r.up);
  const banner = allUp
    ? { color: '#16a34a', text: 'Todos os sistemas operacionais' }
    : { color: '#dc2626', text: 'Instabilidade detectada em um ou mais serviços' };

  const items = rows
    .map((row) => {
      const dot = row.up ? '#16a34a' : '#dc2626';
      const label = row.up ? 'Operacional' : 'Fora do ar';
      return `
      <li class="row">
        <span class="name">${escapeHtml(row.name)}</span>
        <span class="meta">
          <span class="uptime">${formatPercent(row.uptimePercent)} (24h)</span>
          <span class="status"><span class="dot" style="background:${dot}"></span>${label}</span>
        </span>
      </li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="60" />
<title>Status dos serviços</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #f5f5f7; color: #1d1d1f; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
  .banner { border-radius: 12px; padding: 20px 24px; color: #fff; font-size: 18px; font-weight: 600; background: ${banner.color}; }
  ul { list-style: none; padding: 0; margin: 24px 0 0; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #ececec; }
  .row:last-child { border-bottom: none; }
  .name { font-weight: 500; }
  .meta { display: flex; gap: 16px; align-items: center; font-size: 14px; }
  .uptime { color: #6e6e73; }
  .status { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .footer { margin-top: 20px; font-size: 12px; color: #86868b; text-align: center; }
  @media (prefers-color-scheme: dark) {
    body { background: #000; color: #f5f5f7; }
    ul { background: #1c1c1e; }
    .row { border-color: #2c2c2e; }
    .uptime { color: #98989d; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="banner">${banner.text}</div>
    <ul>${items || '<li class="row"><span class="name">Nenhum serviço monitorado</span></li>'}</ul>
    <p class="footer">Atualizado em ${escapeHtml(generatedAtIso)} · atualiza a cada 60s</p>
  </div>
</body>
</html>`;
}
