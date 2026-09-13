import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { SUPPORTED_MODELS } from './src/translate.ts';

const WORKERS_TESTS = 'src/**/*.workers.test.ts';

/** Their own project: the rest want translation off, so no alarm moves the
 * version under them. Both projects name the model rather than leaning on
 * wrangler.jsonc, which a developer's .dev.vars is entitled to override.
 * No D1 setup file here: importing cloudflare:test before the test file loads
 * the worker ahead of the test's mock of the model. */
const TRANSLATION_TESTS = 'src/translation.workers.test.ts';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(async () => {
	const migrations = await readD1Migrations(here('./migrations'));

	function pool(vars: Record<string, string>) {
		return cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			// The bundled workerd trails the project's compatibility date, and
			// remote bindings would need credentials CI does not have.
			miniflare: {
				compatibilityDate: '2026-08-22',
				bindings: {
					SESSION_SECRET: 'test-secret',
					ADMIN_EMAILS: 'admin@example.com',
					TEST_MIGRATIONS: migrations,
					...vars,
				},
			},
			remoteBindings: false,
		});
	}

	return {
		test: {
			projects: [
				{
					test: {
						name: 'unit',
						include: ['src/**/*.test.ts'],
						exclude: [WORKERS_TESTS],
					},
				},
				{
					plugins: [react()],
					resolve: {
						alias: { '@branding': here('./branding/default') },
					},
					test: {
						name: 'client',
						environment: 'jsdom',
						include: ['src/client/**/*.test.tsx'],
					},
				},
				{
					plugins: [pool({ TRANSLATION_MODEL: '' })],
					test: {
						name: 'workers',
						include: [WORKERS_TESTS],
						exclude: [TRANSLATION_TESTS],
						setupFiles: ['./vitest.setup.ts'],
					},
				},
				{
					plugins: [pool({ TRANSLATION_MODEL: SUPPORTED_MODELS[0] })],
					test: {
						name: 'translation',
						include: [TRANSLATION_TESTS],
					},
				},
			],
		},
	};
});
