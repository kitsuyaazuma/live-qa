import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile';

function answering(body: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(Response.json(body, { status }))),
	);
}

const ASK = { secret: 's3cret', token: 'tok', hostname: 'qa.example.com', remoteip: '203.0.113.9' };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('verifyTurnstile', () => {
	it('passes a token solved on this host and sends what siteverify needs', async () => {
		answering({ success: true, hostname: 'qa.example.com' });

		const passed = await verifyTurnstile(ASK);

		expect(passed).toBe(true);
		const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(JSON.parse(String(init.body))).toEqual({
			secret: 's3cret',
			response: 'tok',
			remoteip: '203.0.113.9',
		});
	});

	it('fails a token solved elsewhere, or not at all', async () => {
		answering({ success: true, hostname: 'other.example.com' });
		const elsewhere = await verifyTurnstile(ASK);
		answering({ success: false, 'error-codes': ['invalid-input-response'] }, 400);
		const refused = await verifyTurnstile(ASK);

		expect([elsewhere, refused]).toEqual([false, false]);
	});

	it('throws rather than guessing when siteverify is down or the secret is wrong', async () => {
		answering({}, 502);
		const down = verifyTurnstile(ASK);
		answering({ success: false, 'error-codes': ['invalid-input-secret'] }, 400);
		const wrongSecret = verifyTurnstile(ASK);

		await expect(down).rejects.toThrow('siteverify answered 502');
		await expect(wrongSecret).rejects.toThrow('TURNSTILE_SECRET_KEY');
	});
});
