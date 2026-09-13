import { describe, expect, it } from 'vitest';
import { safePath } from './auth';

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
