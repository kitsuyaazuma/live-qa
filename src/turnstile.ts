const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface Verdict {
	success: boolean;
	hostname?: string;
	'error-codes'?: string[];
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
	// A refused token is a 400 with the verdict in the body, so only a 5xx is an outage.
	if (response.status >= 500) throw new Error(`siteverify answered ${response.status}`);
	const verdict = (await response.json()) as Verdict;
	if (verdict['error-codes']?.includes('invalid-input-secret')) {
		throw new Error('siteverify does not accept TURNSTILE_SECRET_KEY');
	}
	return verdict.success && verdict.hostname === input.hostname;
}
