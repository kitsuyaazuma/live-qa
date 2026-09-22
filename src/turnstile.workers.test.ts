import { createExecutionContext } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { NO_DEVICE } from './protocol';

const SITEKEY = '1x00000000000000000000AA';
const GUARDED: Env = {
	...env,
	TURNSTILE_SITE_KEY: SITEKEY,
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
	it('is named in the 401 a bare write gets, and absent without a widget', async () => {
		const question = { method: 'POST', body: JSON.stringify({ id: 'q1', text: 'hello' }) };

		const checked = await guarded('/api/rooms/scratch-checked/questions', question);
		const open = await exports.default.fetch(
			new Request('https://example.com/api/rooms/scratch-open/questions', question),
		);

		expect(checked.status).toBe(401);
		expect(await checked.json()).toEqual({ error: NO_DEVICE, sitekey: SITEKEY });
		expect(await open.json()).toEqual({ error: NO_DEVICE, sitekey: null });
	});

	it('issues a cookie for a token solved here, and for nothing less', async () => {
		siteverifySays({ success: true, hostname: 'example.com' });
		const solved = await claim('XXXX.DUMMY.TOKEN.XXXX');
		siteverifySays({ success: true, hostname: 'elsewhere.example.com' });
		const elsewhere = await claim('XXXX.DUMMY.TOKEN.XXXX');
		siteverifySays({ success: false, 'error-codes': ['invalid-input-response'] });
		const refused = await claim('nope');
		const missing = await claim();

		expect(solved.status).toBe(204);
		expect(solved.headers.get('set-cookie')).toMatch(/^device=/);
		expect([elsewhere.status, refused.status, missing.status]).toEqual([403, 403, 400]);
		expect(elsewhere.headers.get('set-cookie')).toBeNull();
	});

	it("passes Cloudflare's testing keys wherever the token was solved", async () => {
		siteverifySays({
			success: true,
			hostname: 'somewhere.else',
			metadata: { result_with_testing_key: true },
		});

		expect((await claim('XXXX.DUMMY.TOKEN.XXXX')).status).toBe(204);
	});

	it('answers an outage at siteverify as an error, not as a failed check', async () => {
		siteverifySays({ success: false, 'error-codes': ['internal-error'] });

		expect((await claim('XXXX.DUMMY.TOKEN.XXXX')).status).toBe(500);
	});

	it('sends the secret, the token and the address to siteverify', async () => {
		siteverifySays({ success: true, hostname: 'example.com' });

		await guarded('/api/device', {
			method: 'POST',
			headers: { 'cf-connecting-ip': '203.0.113.9' },
			body: JSON.stringify({ token: 'XXXX.DUMMY.TOKEN.XXXX' }),
		});

		const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(JSON.parse(String(init.body))).toEqual({
			secret: '1x0000000000000000000000000000000AA',
			response: 'XXXX.DUMMY.TOKEN.XXXX',
			remoteip: '203.0.113.9',
		});
	});
});
