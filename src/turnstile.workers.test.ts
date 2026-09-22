import { createExecutionContext } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const GUARDED: Env = {
	...env,
	TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
	TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};

function guarded(path: string, init?: RequestInit) {
	return api.request(`https://example.com${path}`, init, GUARDED, createExecutionContext());
}

function claim(token?: string) {
	return guarded('/api/device', {
		method: 'POST',
		body: token === undefined ? undefined : JSON.stringify({ token }),
	});
}

function siteverifySays(body: unknown) {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(Response.json(body))),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the check before a new device', () => {
	it('is absent unless a widget is configured', async () => {
		const response = await exports.default.fetch(new Request('https://example.com/api/device'));

		expect(await response.json()).toEqual({ sitekey: null });
		expect(response.headers.get('cache-control')).toBe('public, max-age=300');
	});

	it('names its site key when one is', async () => {
		const response = await guarded('/api/device');

		expect(await response.json()).toEqual({ sitekey: '1x00000000000000000000AA' });
	});

	it('issues a cookie for a token solved here, and for nothing less', async () => {
		siteverifySays({ success: true, hostname: 'example.com' });
		const solved = await claim('XXXX.DUMMY.TOKEN.XXXX');
		siteverifySays({ success: true, hostname: 'elsewhere.example.com' });
		const elsewhere = await claim('XXXX.DUMMY.TOKEN.XXXX');
		siteverifySays({ success: false });
		const failed = await claim('nope');
		const missing = await claim();

		expect(solved.status).toBe(204);
		expect(solved.headers.get('set-cookie')).toMatch(/^device=/);
		expect([elsewhere.status, failed.status, missing.status]).toEqual([403, 403, 400]);
		expect(elsewhere.headers.get('set-cookie')).toBeNull();
	});

	it('sends the secret, the token and the address to siteverify', async () => {
		siteverifySays({ success: true, hostname: 'example.com' });

		await guarded('/api/device', {
			method: 'POST',
			headers: { 'cf-connecting-ip': '203.0.113.9' },
			body: JSON.stringify({ token: 'XXXX.DUMMY.TOKEN.XXXX' }),
		});

		const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(JSON.parse(String(init.body))).toEqual({
			secret: '1x0000000000000000000000000000000AA',
			response: 'XXXX.DUMMY.TOKEN.XXXX',
			remoteip: '203.0.113.9',
		});
	});
});
