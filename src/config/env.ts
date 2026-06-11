import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TZ: z.string().default('America/Sao_Paulo'),

  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN é obrigatório'),
  CHAT_ID: z.string().min(1, 'CHAT_ID é obrigatório'),

  VERCEL_TOKEN: z.string().min(1, 'VERCEL_TOKEN é obrigatório'),
  VERCEL_TEAM_ID: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),

  CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  DEPLOY_POLL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(1),
  PROJECT_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),

  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10_000),
  LATENCY_THRESHOLD_MS: z.coerce.number().int().min(1).default(2_000),
  P95_THRESHOLD_MS: z.coerce.number().int().min(1).default(4_000),
  P99_THRESHOLD_MS: z.coerce.number().int().min(1).default(8_000),

  REPORT_HOUR: z.coerce.number().int().min(0).max(23).default(8),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Logger ainda não está disponível neste ponto do bootstrap.
    console.error(`Variáveis de ambiente inválidas:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
