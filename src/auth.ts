import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { findAccount } from './accounts';
import type { Account } from './protocol';

const SESSION = 'session';
const SESSION_DAYS = 30;

export type App = { Bindings: Env; Variables: { account: Account } };

export type Ctx = Context<App>;

/** Without a secret nothing can be signed, so signing in is off. */
export function sessionSecret(env: Env): string | undefined {
	return env.SESSION_SECRET?.trim() || undefined;
}

export async function issueSession(c: Ctx, secret: string, userId: string): Promise<void> {
	await setSignedCookie(c, SESSION, userId, secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
		// Plain http only happens on a developer's localhost.
		secure: new URL(c.req.url).protocol === 'https:',
		maxAge: SESSION_DAYS * 86400,
	});
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
