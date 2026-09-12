/**
 * Secrets, which `wrangler types` cannot see. Declaration merging keeps them
 * through a regenerated worker-configuration.d.ts.
 */
interface Env {
	/** `wrangler secret put MODERATOR_TOKEN`. Absent disables the moderator routes. */
	MODERATOR_TOKEN?: string;
}
