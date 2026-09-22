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
		answering({ success: false, 'error-codes': ['timeout-or-duplicate'] });
		const reused = await verifyTurnstile(ASK);

		expect([elsewhere, refused, reused]).toEqual([false, false, false]);
	});

	it("passes Cloudflare's testing keys wherever the token was solved", async () => {
		answering({
			success: true,
			hostname: 'example.com',
			metadata: { result_with_testing_key: true },
		});

		expect(await verifyTurnstile(ASK)).toBe(true);
	});

	it('throws rather than guessing when the answer is not a verdict on the person', async () => {
		answering('<html>bad gateway</html>', 502);
		const down = verifyTurnstile(ASK);
		answering({ success: false, 'error-codes': ['invalid-input-secret'] }, 400);
		const wrongSecret = verifyTurnstile(ASK);
		answering({ success: false, 'error-codes': ['internal-error'] });
		const flaky = verifyTurnstile(ASK);

		await expect(down).rejects.toThrow('siteverify answered 502');
		await expect(wrongSecret).rejects.toThrow('invalid-input-secret');
		await expect(flaky).rejects.toThrow('internal-error');
	});
});
