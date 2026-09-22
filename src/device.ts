import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { type Ctx, cookieOptions, sessionSecret } from './auth';

const DEVICE = 'device';
const DEVICE_DAYS = 365;

/** Hono signs the value alone, so without a key of its own a session cookie would pass as a device. */
export function deviceSecret(env: Env): string | undefined {
	const secret = sessionSecret(env);
	return secret && `${secret}#${DEVICE}`;
}

export async function currentDevice(c: Ctx): Promise<string | null> {
	const secret = deviceSecret(c.env);
	if (!secret) return null;
	const id = await getSignedCookie(c, secret, DEVICE);
	return id || null;
}

export async function issueDevice(c: Ctx, secret: string): Promise<void> {
	await setSignedCookie(c, DEVICE, crypto.randomUUID(), secret, cookieOptions(c, DEVICE_DAYS));
}
