import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { type Ctx, sessionSecret } from './auth';

const DEVICE = 'device';
const DEVICE_DAYS = 365;

export async function currentDevice(c: Ctx): Promise<string | null> {
	const secret = sessionSecret(c.env);
	if (!secret) return null;
	const id = await getSignedCookie(c, secret, DEVICE);
	return id || null;
}

export async function issueDevice(c: Ctx): Promise<string> {
	const secret = sessionSecret(c.env);
	if (!secret) throw new Error('SESSION_SECRET is not set');
	const id = crypto.randomUUID();
	await setSignedCookie(c, DEVICE, id, secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
		secure: new URL(c.req.url).protocol === 'https:',
		maxAge: DEVICE_DAYS * 86400,
	});
	return id;
}
