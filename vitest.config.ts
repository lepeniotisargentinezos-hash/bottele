import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Escopo de cobertura: camadas com lógica de negócio.
      // Wiring (bot, jobs, app.ts) é coberto pelos testes de integração.
      include: [
        'src/utils/**',
        'src/services/**',
        'src/integrations/vercel/**',
        'src/middleware/**',
      ],
      // Barrels e arquivos só de tipos não contêm lógica.
      exclude: ['**/index.ts', '**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
