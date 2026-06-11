// Defaults de ambiente para os testes — executa antes de qualquer import de src/.
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_TOKEN ??= 'test-telegram-token';
process.env.VERCEL_TOKEN ??= 'test-vercel-token';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.CHAT_ID ??= '123456789';
process.env.LOG_LEVEL = 'fatal';
