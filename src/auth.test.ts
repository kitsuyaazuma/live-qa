import { describe, expect, it } from 'vitest';
import { adminEmails, offeredProviders, safePath } from './auth';

function env(vars: Record<string, string>): Env {
	return vars as unknown as Env;
}

describe('offeredProviders', () => {
	it('offers a provider only with both halves of its client and a session secret', () => {
		const whole = {
			SESSION_SECRET: 's',
			GOOGLE_CLIENT_ID: 'g',
			GOOGLE_CLIENT_SECRET: 'gs',
			GITHUB_CLIENT_ID: 'h',
			GITHUB_CLIENT_SECRET: 'hs',
		};

		expect(offeredProviders(env(whole))).toEqual(['google', 'github']);
		expect(offeredProviders(env({ ...whole, GOOGLE_CLIENT_SECRET: '' }))).toEqual(['github']);
		expect(offeredProviders(env({ ...whole, SESSION_SECRET: ' ' }))).toEqual([]);
	});
});

describe('adminEmails', () => {
	it('takes the addresses apart, lowercased, and drops the blanks', () => {
		expect(adminEmails(env({ ADMIN_EMAILS: ' One@Example.com , ,two@example.com,' }))).toEqual([
			'one@example.com',
			'two@example.com',
		]);
		expect(adminEmails(env({}))).toEqual([]);
	});
});

describe('safePath', () => {
	it('keeps a path on this origin', () => {
		expect(safePath('/r/keynote/admin')).toBe('/r/keynote/admin');
	});

	it('sends anything that could leave the origin home', () => {
		for (const value of [undefined, '', 'https://example.com', '//example.com', '/\\example.com']) {
			expect(safePath(value)).toBe('/');
		}
	});
});
