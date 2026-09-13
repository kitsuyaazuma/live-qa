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
	],
});
