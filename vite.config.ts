import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The folder under branding/ to build with: BRANDING=pek2026 pnpm run deploy. */
const branding = fileURLToPath(
	new URL(`./branding/${process.env.BRANDING ?? 'default'}`, import.meta.url),
);

const { title } = JSON.parse(readFileSync(`${branding}/branding.json`, 'utf8')) as {
	title: string;
};

/** Served with every asset by the asset router; the api sets its own. */
const HEADERS = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

export default defineConfig({
	publicDir: `${branding}/public`,
	resolve: { alias: { '@branding': branding } },
	plugins: [
		cloudflare(),
		react(),
		tailwindcss(),
		{
			name: 'branding-title',
			transformIndexHtml: (html) =>
				html.replace(
					/<title>.*<\/title>/,
					`<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`,
				),
		},
		{
			name: 'asset-headers',
			generateBundle() {
				if (this.environment.name !== 'client') return;
				this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS });
			},
		},
	],
});
