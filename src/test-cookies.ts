import { serializeSigned } from 'hono/utils/cookie';
import { deviceSecret } from './device';

const SESSION_SECRET = 'test-secret';

/** Signed the way the worker signs under the pool's SESSION_SECRET. */
export async function signedCookie(name: 'session' | 'device', value: string): Promise<string> {
	const secret = name === 'device' ? deviceSecret({ SESSION_SECRET } as Env) : SESSION_SECRET;
	return (await serializeSigned(name, value, secret as string)).split(';')[0] ?? '';
}
