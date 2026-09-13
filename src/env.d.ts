/**
 * Secrets, which `wrangler types` cannot see. Declaration merging keeps them
 * through a regenerated worker-configuration.d.ts.
 *
 * Regenerate with .dev.vars moved aside, or wrangler writes a required
 * MODERATOR_TOKEN that collides with this one and costs Env its type.
 */
interface Env {
	/** `wrangler secret put MODERATOR_TOKEN`. Absent disables the moderator routes. */
	MODERATOR_TOKEN?: string;
}
