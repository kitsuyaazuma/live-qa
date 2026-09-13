import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { findAccount, signIn } from './accounts';

describe('accounts', () => {
	it('gives an account one id however often it signs in', async () => {
		const first = await signIn(env.DB, {
			provider: 'github',
			providerId: '42',
			email: null,
			name: 'octocat',
			avatar: 'https://example.com/a.png',
		});
		const again = await signIn(env.DB, {
			provider: 'github',
			providerId: '42',
			email: 'octo@example.com',
			name: 'Octo Renamed',
			avatar: null,
		});

		expect(again.id).toBe(first.id);
		// The name is the account's own once chosen; the provider only fills gaps.
		expect(again).toMatchObject({
			name: 'octocat',
			email: 'octo@example.com',
			avatar: 'https://example.com/a.png',
		});
	});

	it('keeps the same person on two providers apart', async () => {
		const google = await signIn(env.DB, {
			provider: 'google',
			providerId: 'g-1',
			email: 'same@example.com',
			name: 'Same',
			avatar: null,
		});
		const github = await signIn(env.DB, {
			provider: 'github',
			providerId: 'g-1',
			email: 'same@example.com',
			name: 'Same',
			avatar: null,
		});

		expect(google.id).not.toBe(github.id);
	});

	it('has nothing for an id it never issued', async () => {
		expect(await findAccount(env.DB, 'nobody')).toBeNull();
	});
});
