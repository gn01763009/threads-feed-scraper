import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['node_modules/**', 'test/e2e*.ts', 'test/smoke.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/main.ts'],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
        },
    },
});
