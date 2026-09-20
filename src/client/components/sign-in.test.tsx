import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The hook answers once per page load, so each test gets a fresh module. */
beforeEach(() => {
	vi.resetModules();
});

function offering(providers: string[]) {
	vi.stubGlobal('fetch', () =>
		Promise.resolve(
			new Response(JSON.stringify({ providers }), {
				headers: { 'content-type': 'application/json' },
			}),
		),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('SignIn', () => {
	it('offers only the providers the worker has credentials for', async () => {
		offering(['github']);
		const { SignIn } = await import('./sign-in');
		render(<SignIn next="/" />);

		expect(await screen.findByText('Continue with GitHub')).toBeTruthy();
		expect(screen.queryByText('Continue with Google')).toBeNull();
	});

	it('says so when no provider is set up', async () => {
		offering([]);
		const { SignIn } = await import('./sign-in');
		render(<SignIn next="/" reason="Hosting takes an account." />);

		expect(await screen.findByText('Signing in is not set up here.')).toBeTruthy();
		expect(screen.getByText('Hosting takes an account.')).toBeTruthy();
	});
});
