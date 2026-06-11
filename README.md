# Vercel Telegram Monitor

Bot do Telegram para monitoramento completo de uma conta Vercel: deployments, disponibilidade, performance e relatórios automáticos.

## Funcionalidades

- 🔎 **Descoberta automática de projetos** — sincroniza todos os projetos da conta e detecta novos automaticamente.
- 🚨 **Monitoramento de deployments** — alerta imediato em falhas e cancelamentos, com branch, commit, autor e motivo do erro extraído dos logs de build.
- 🔴 **Monitoramento de disponibilidade** — verifica os domínios de produção a cada 5 minutos (HTTP 5xx, timeout, DNS inválido) e avisa na queda e na recuperação (com duração da indisponibilidade).
- ⚡ **Performance** — latência média, P95 e P99 com thresholds configuráveis e alertas de degradação/normalização.
- 🔐 **Monitor de SSL** — verifica os certificados TLS dos domínios e avisa 14/7/3/1 dias antes de expirar (conexão direta, sem depender da Vercel).
- 🔌 **Monitor de serviços externos** — acompanha gateways de pagamento e APIs de terceiros (ex.: AnubisPay) e alerta na hora que saem do ar e quando voltam, com tempo fora.
- 🎮 **Ações pela conversa** — alertas de falha trazem botões inline: **Redeploy** e **Ver logs**; alertas de queda trazem **Checar agora**. Comandos `/rollback` (reverte produção), `/logs` e `/settings` interativo.
- 🔍 **Checagem de conteúdo + URLs extras** — além do status HTTP, valida que a página contém um texto esperado (pega erros "silenciosos") e monitora endpoints adicionais (ex.: `/api/health`) por projeto.
- 📈 **Web Analytics via Drain** — recebe visitantes, page views, top páginas, países e dispositivos que a Vercel envia (push) pelo Web Analytics Drain. Sem tocar nos sites; requer plano Pro.
- 📊 **Relatórios** — relatório diário às 08:00 (com gráfico de latência por projeto via QuickChart) e resumo semanal com deploys, falhas, incidentes, tempo offline e disponibilidade.
- 🌐 **Status page pública** — `GET /status` serve uma página compartilhável com o estado de cada projeto.
- 🔐 **Segurança** — bot restrito ao `CHAT_ID` configurado, rate limiting (bot e HTTP), validação de ambiente com Zod, logs com redação de segredos.
- 🩺 **Observabilidade** — `GET /health`, `GET /metrics`, logs estruturados (pino) e monitoramento interno de todos os jobs.

## Stack

Node.js 22+ · TypeScript · grammY (Telegram) · Fastify · PostgreSQL · Prisma · node-cron · Docker · Vitest · ESLint · Prettier

## Arquitetura

Composition root (`src/container.ts`) faz toda a injeção de dependências. Serviços dependem de abstrações (repositórios, notifier, HTTP checker), o que mantém as camadas testáveis e desacopladas.

```
src/
├── app.ts                  # Bootstrap: DB → HTTP → sync inicial → jobs → bot
├── container.ts            # Composition root (Dependency Injection)
├── server.ts               # Fastify: /health e /metrics
├── bot/                    # Montagem do bot grammY (middleware + comandos)
├── commands/               # Um arquivo por comando do Telegram
├── services/               # Regras de negócio (sync, deploys, uptime, perf, reports)
├── integrations/
│   ├── vercel/             # Cliente da API REST da Vercel (auth, paginação, retry)
│   └── telegram/           # Notifier (envio proativo + auditoria)
├── jobs/                   # Registry + scheduler (node-cron) com guarda de sobreposição
├── database/               # Prisma client + Repository Pattern
├── middleware/             # Auth e rate limit do bot; error handler HTTP
├── types/                  # Tipos de domínio
├── utils/                  # logger, format, stats, errors
└── config/                 # Validação de ambiente (Zod)
```

### Fluxo de dados

1. **Jobs** (node-cron) chamam os **serviços** em intervalos configuráveis.
2. Serviços usam o **VercelClient** e os **repositórios** (Prisma) para coletar/persistir.
3. Mudanças relevantes (falha de deploy, site fora do ar, degradação) viram **incidentes** no banco e **alertas** via `TelegramNotifier` — que audita cada envio na tabela `notifications`.
4. Comandos do bot leem o banco (nunca chamam a API da Vercel diretamente em hot path).

## Instalação

### Pré-requisitos

- Node.js 22+
- PostgreSQL 14+ (ou Docker)
- Um bot do Telegram (crie com [@BotFather](https://t.me/BotFather))
- Token da Vercel ([vercel.com/account/tokens](https://vercel.com/account/tokens))

### Passo a passo (local)

```bash
git clone <repo>
cd vercel-telegram-monitor
npm install
cp .env.example .env       # preencha as variáveis
npm run prisma:generate
npm run prisma:migrate:dev # aplica as migrations
npm run dev
```

### Como descobrir seu CHAT_ID

Envie uma mensagem para o seu bot e acesse:
`https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates` — o campo `message.chat.id` é o seu `CHAT_ID`.

## Docker

```bash
cp .env.example .env   # preencha TELEGRAM_BOT_TOKEN, VERCEL_TOKEN e CHAT_ID
docker compose up -d --build
```

O compose sobe PostgreSQL (com volume persistente `pgdata`) e o bot. As migrations são aplicadas automaticamente no boot (`docker-entrypoint.sh`). O healthcheck do container usa `GET /health`.

```bash
docker compose logs -f bot     # acompanhar logs
docker compose down            # parar (dados preservados no volume)
```

## Webhooks da Vercel (alertas instantâneos)

Com o webhook configurado, falhas de deploy chegam em ~1 segundo (em vez de até 1 minuto do polling) e deploys de produção ganham uma **mensagem viva** no Telegram: "🔨 Deploy iniciado..." que é editada em tempo real até "✅ concluído" ou "🚨 falhou" (com duração). O polling continua ativo como backup — a deduplicação evita alertas em dobro.

**Configuração:**

1. Gere um domínio público para o serviço (no Railway: Settings → Networking → Generate Domain).
2. No dashboard da Vercel: **Team Settings → Webhooks → Create Webhook**
   - URL: `https://<seu-dominio>/webhooks/vercel`
   - Eventos: `deployment.created`, `deployment.succeeded`, `deployment.error`, `deployment.canceled`
   - Projetos: todos (ou os que quiser)
3. Copie o **secret** exibido na criação e defina `VERCEL_WEBHOOK_SECRET` no ambiente.
4. Redeploy. Sem o secret, a rota fica desativada e tudo segue via polling.

A rota valida a assinatura `x-vercel-signature` (HMAC SHA-1 do corpo bruto) com comparação em tempo constante; requisições sem assinatura válida recebem 401.

## Web Analytics via Drain (visitantes)

Requer **plano Pro**. A Vercel envia (push) cada page view/evento para o endpoint `POST /drains/analytics`, alimentando `/visitors` e `/analytics` com dados reais — sem tocar nos sites (o `@vercel/analytics` já instalado alimenta o drain).

1. Garanta um domínio público para o serviço (mesmo dos webhooks).
2. No dashboard: **Team Settings → Drains → Add Drain**
   - Tipo: **Web Analytics**
   - Destino (Custom Endpoint): `https://<seu-dominio>/drains/analytics`
   - Formato: **JSON** (NDJSON também é aceito)
   - Projetos: todos
3. Copie o **Signature Verification Secret** e defina `VERCEL_DRAIN_SECRET` no ambiente.
4. Redeploy. Use o botão **Test** da Vercel para validar a entrega.

A rota valida a mesma assinatura `x-vercel-signature` (HMAC SHA-1) dos webhooks. Sem o secret, `/drains/analytics` fica desativado. Os eventos crus ficam na tabela `page_views` com retenção de 90 dias.

## Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Token do bot (@BotFather) |
| `CHAT_ID` | ✅ | — | Chat autorizado a usar o bot e receber alertas |
| `VERCEL_TOKEN` | ✅ | — | Token de acesso da Vercel |
| `VERCEL_TEAM_ID` | — | — | ID do time (vazio = conta pessoal) |
| `VERCEL_WEBHOOK_SECRET` | — | — | Secret do webhook (vazio = rota desativada, só polling) |
| `VERCEL_DRAIN_SECRET` | — | — | Secret do Web Analytics Drain (vazio = `/drains/analytics` desativado) |
| `DATABASE_URL` | ✅ | — | Connection string PostgreSQL |
| `CHECK_INTERVAL_MINUTES` | — | `5` | Intervalo dos checks de disponibilidade |
| `DEPLOY_POLL_INTERVAL_MINUTES` | — | `1` | Intervalo do polling de deployments |
| `PROJECT_SYNC_INTERVAL_MINUTES` | — | `15` | Intervalo da sincronização de projetos |
| `HTTP_TIMEOUT_MS` | — | `10000` | Timeout dos checks HTTP |
| `LATENCY_THRESHOLD_MS` | — | `2000` | Threshold de latência média |
| `P95_THRESHOLD_MS` | — | `4000` | Threshold de P95 |
| `P99_THRESHOLD_MS` | — | `8000` | Threshold de P99 |
| `REPORT_HOUR` | — | `8` | Hora local do relatório diário |
| `TZ` | — | `America/Sao_Paulo` | Timezone dos jobs |
| `PORT` | — | `3000` | Porta do servidor HTTP |
| `LOG_LEVEL` | — | `info` | Nível de log (pino) |

Os thresholds também podem ser alterados em runtime: são persistidos na tabela `settings` (chave `alert_settings`) e sobrescrevem os defaults do ambiente.

## Comandos do Telegram

| Comando | Descrição |
|---|---|
| `/start` | Visão geral do bot |
| `/help` | Lista de comandos |
| `/overview` | Painel geral: status ao vivo, domínio e visitantes de hoje por projeto |
| `/painel` | Menu interativo — clique num domínio e veja o card completo (status, gateway+conta, visitantes, top páginas, SSL, deploys e env vars) |
| `/projects` | Projetos monitorados com status (🟢/🔴) |
| `/status` | Visão geral da conta (projetos, incidentes, deploys 24h, uptime) |
| `/deploys` | Últimos 10 deployments |
| `/errors` | Incidentes abertos + falhas de deploy dos últimos 7 dias |
| `/analytics` | Tráfego dos últimos 7 dias: visitantes, top páginas, países, dispositivos |
| `/visitors` | Visitantes por projeto (hoje e 7 dias) |
| `/performance` | Latência média, P95 e P99 por projeto (24h) |
| `/uptime` | Disponibilidade por projeto, global e SSL expirando |
| `/report` | Gera o relatório diário sob demanda |
| `/health` | Saúde interna (DB, API Vercel, estado dos jobs) |
| `/rollback [projeto]` | Reverte a produção para o deploy anterior (com confirmação) |
| `/logs <projeto>` | Logs de build do deploy mais recente |
| `/check <projeto>` | Configura texto esperado e URLs extras de monitoramento |
| `/monitor` | Monitora serviços externos (gateways de pagamento, APIs) |
| `/settings` | Menu interativo de alertas e thresholds |

## Jobs agendados

| Job | Agenda (default) | Função |
|---|---|---|
| `sync-projects` | a cada 15 min | Descobre/atualiza projetos |
| `monitor-deployments` | a cada 1 min | Detecta deploys concluídos/falhados/cancelados |
| `uptime-check` | a cada 5 min | Verifica disponibilidade dos domínios |
| `performance-evaluation` | a cada 5 min | Avalia thresholds de latência |
| `daily-report` | 08:00 | Relatório diário (com gráfico de latência) |
| `weekly-report` | segunda 08:00 | Relatório semanal |
| `ssl-check` | 08:00 | Verifica expiração dos certificados TLS |
| `external-monitor` | a cada 5 min | Checa gateways/APIs externos |
| `prune-metrics` | 03:30 | Retenção de métricas (90 dias) |

## Observabilidade

- `GET /health` → `{"status":"ok"}` (200) ou `{"status":"degraded"}` (503)
- `GET /metrics` → uptime do processo, estado de DB/API Vercel e estatísticas de cada job (execuções, falhas, último erro)
- `GET /status` → status page pública (HTML) com o estado e o uptime de cada projeto
- `POST /drains/analytics` → recebe Web Analytics da Vercel (quando `VERCEL_DRAIN_SECRET` configurado)
- `POST /webhooks/anubispay?token=…` → recebe webhooks de venda do AnubisPay (registra receita; alerta na venda confirmada)
- Logs estruturados JSON em produção (pino), com redação automática de tokens

## Testes

```bash
npm test               # roda a suíte
npm run test:coverage  # com cobertura (mínimo 80% nas camadas de lógica)
```

A API da Vercel é mockada (`tests/mocks/`) — nenhum teste depende de rede ou banco.

## Qualidade

```bash
npm run lint     # ESLint
npm run format   # Prettier
npm run build    # tsc
```

## Deploy em produção

Qualquer host com Docker serve (VPS, Fly.io, Railway, etc.):

1. Configure as variáveis de ambiente do `.env.example`.
2. `docker compose up -d --build` (ou use apenas o `Dockerfile` com um Postgres gerenciado).
3. Aponte o healthcheck do orquestrador para `GET /health`.

> O bot usa **long polling** — não precisa de URL pública nem webhook.
