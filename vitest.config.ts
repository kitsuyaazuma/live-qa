import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const WORKERS_TESTS = 'src/**/*.workers.test.ts';

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
				plugins: [
					cloudflareTest({
						wrangler: { configPath: './wrangler.jsonc' },
						// The bundled workerd trails the project's compatibility date, and
						// remote bindings would need credentials CI does not have.
						miniflare: { compatibilityDate: '2026-08-22' },
						remoteBindings: false,
					}),
				],
				test: {
					name: 'workers',
					include: [WORKERS_TESTS],
				},
			},
		],
	},
});
