import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { avatarOf, clearAvatar, findAccount, rename, setAvatar, signIn } from './accounts';

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
		// The name is the account's own once chosen; email and picture follow the provider.
		expect(again).toMatchObject({ name: 'octocat', email: 'octo@example.com', avatar: null });
	});

	it('prefers a picture the account uploaded, until it is dropped', async () => {
		const account = await signIn(env.DB, {
			provider: 'google',
			providerId: 'pic-1',
			email: null,
			name: 'Pic',
			avatar: 'https://example.com/provider.png',
		});

		await setAvatar(env.DB, account.id, new Uint8Array([1, 2, 3]).buffer, 'image/png');
		const uploaded = await findAccount(env.DB, account.id);
		const stored = await avatarOf(env.DB, account.id);
		await clearAvatar(env.DB, account.id);
		const dropped = await findAccount(env.DB, account.id);

		expect(uploaded?.avatar).toMatch(new RegExp(`^/api/avatars/${account.id}\\?v=\\d+$`));
		expect(stored).toMatchObject({ type: 'image/png' });
		expect(stored?.bytes).toEqual(new Uint8Array([1, 2, 3]));
		expect(dropped?.avatar).toBe('https://example.com/provider.png');
	});

	it('keeps a chosen name through the next sign-in', async () => {
		const profile = {
			provider: 'github' as const,
			providerId: 'renamed-1',
			email: null,
			name: 'Provider Name',
			avatar: null,
		};
		const account = await signIn(env.DB, profile);

		await rename(env.DB, account.id, 'Chosen');

		expect((await signIn(env.DB, profile)).name).toBe('Chosen');
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
