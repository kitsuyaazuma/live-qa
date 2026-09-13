import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { SUPPORTED_MODELS } from './src/translate.ts';

const WORKERS_TESTS = 'src/**/*.workers.test.ts';

/** Their own project: the rest want translation off, so no alarm moves the
 * version under them. Both projects name the model rather than leaning on
 * wrangler.jsonc, which a developer's .dev.vars is entitled to override. */
const TRANSLATION_TESTS = 'src/translation.workers.test.ts';

function pool(vars: Record<string, string>) {
	return cloudflareTest({
		wrangler: { configPath: './wrangler.jsonc' },
		// The bundled workerd trails the project's compatibility date, and
		// remote bindings would need credentials CI does not have.
		miniflare: {
			compatibilityDate: '2026-08-22',
			bindings: { MODERATOR_TOKEN: 'test-token', ...vars },
		},
		remoteBindings: false,
	});
}

export default defineConfig({
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
					alias: { '@branding': fileURLToPath(new URL('./branding/default', import.meta.url)) },
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
});
