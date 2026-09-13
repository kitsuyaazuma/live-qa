import { describe, expect, it } from 'vitest';
import { ago } from './time';

describe('ago', () => {
	it('rounds to the unit a glance can use', () => {
		const now = 1_000_000_000_000;
		expect(ago(now - 20_000, now)).toBe('just now');
		expect(ago(now - 3 * 60_000, now)).toBe('3m ago');
		expect(ago(now - 90 * 60_000, now)).toBe('2h ago');
		expect(ago(now - 30 * 3_600_000, now)).toBe('1d ago');
	});
});
