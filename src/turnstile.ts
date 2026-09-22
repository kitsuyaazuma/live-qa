const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** What a person can cause. Every other code is our configuration or Cloudflare's outage. */
const REFUSALS = ['invalid-input-response', 'missing-input-response', 'timeout-or-duplicate'];

interface Verdict {
	success: boolean;
	hostname?: string;
	'error-codes'?: string[];
	metadata?: { result_with_testing_key?: boolean };
}

/** Passes only a token solved on this host: the widget may allow other hosts too. */
export async function verifyTurnstile(input: {
	secret: string;
	token: string;
	hostname: string;
	remoteip?: string;
}): Promise<boolean> {
	const response = await fetch(SITEVERIFY, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ secret: input.secret, response: input.token, remoteip: input.remoteip }),
	});
	const verdict = (await response.json().catch(() => null)) as Verdict | null;
	if (typeof verdict?.success !== 'boolean') {
		throw new Error(`siteverify answered ${response.status}`);
	}
	if (verdict.success) {
		// Cloudflare's testing keys answer example.com wherever the token was solved.
		return (
			verdict.metadata?.result_with_testing_key === true || verdict.hostname === input.hostname
		);
	}
	const codes = verdict['error-codes'] ?? [];
	if (codes.length > 0 && codes.every((code) => REFUSALS.includes(code))) return false;
	throw new Error(`siteverify refused: ${codes.join(', ') || response.status}`);
}
