/**
 * Secrets, which `wrangler types` cannot see. Declaration merging keeps them
 * through a regenerated worker-configuration.d.ts.
 *
 * Regenerate with .dev.vars moved aside, or wrangler writes these in as
 * required strings, which collides with this and costs Env its type.
 */
interface Env {
	/** Signs the session cookie. Any long random string; rotating it signs everyone out. */
	SESSION_SECRET?: string;
	/** Comma separated. The people who may create rooms and run any of them. */
	ADMIN_EMAILS?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	/** From `pnpm run turnstile`; empty leaves the check off. */
	TURNSTILE_SITE_KEY?: string;
	TURNSTILE_SECRET_KEY?: string;
}
