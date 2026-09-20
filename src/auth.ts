import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { findAccount } from './accounts';
import type { Account, Provider } from './protocol';

const SESSION = 'session';
const SESSION_DAYS = 30;

export type App = { Bindings: Env; Variables: { account: Account } };

export type Ctx = Context<App>;

/** Without a secret nothing can be signed, so signing in is off. */
export function sessionSecret(env: Env): string | undefined {
	return env.SESSION_SECRET?.trim() || undefined;
}

/** Reached only behind a provider route, which has already refused to run without the secret. */
export async function issueSession(c: Ctx, userId: string): Promise<void> {
	const secret = sessionSecret(c.env);
	if (!secret) throw new Error('SESSION_SECRET is not set');
	await setSignedCookie(c, SESSION, userId, secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
		// Plain http only happens on a developer's localhost.
		secure: new URL(c.req.url).protocol === 'https:',
		maxAge: SESSION_DAYS * 86400,
	});
}

/** Both halves of a client, and a secret to sign the session with. */
export function offeredProviders(env: Env): Provider[] {
	if (!sessionSecret(env)) return [];
	const offered: Provider[] = [];
	if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) offered.push('google');
	if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) offered.push('github');
	return offered;
}

export function endSession(c: Ctx): void {
	deleteCookie(c, SESSION, { path: '/' });
}

/** Only a path on this origin; a second slash or a backslash would read as a host. */
export function safePath(value: string | undefined): string {
	return value && /^\/(?![/\\])/.test(value) ? value : '/';
}

export async function currentAccount(c: Ctx): Promise<Account | null> {
	const secret = sessionSecret(c.env);
	if (!secret) return null;
	const id = await getSignedCookie(c, secret, SESSION);
	return id ? findAccount(c.env.DB, id) : null;
}

export function isAdmin(env: Env, account: Account): boolean {
	if (!account.email) return false;
	const admins = (env.ADMIN_EMAILS ?? '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter((email) => email.length > 0);
	return admins.includes(account.email.toLowerCase());
}
