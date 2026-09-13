import { describe, expect, it } from 'vitest';
import { ID_MAX } from '../protocol';
import { slug } from './slug';

describe('slug', () => {
	it('reduces a spoken room name to something that survives a qr code', () => {
		expect(slug('  Platform Engineering Kaigi 2026 ')).toBe('platform-engineering-kaigi-2026');
		expect(slug('Keynote!!')).toBe('keynote');
	});

	it('keeps inside what the room id allows', () => {
		expect(slug('x'.repeat(200))).toHaveLength(ID_MAX);
	});

	it('has nothing to offer for a name with no letters or digits', () => {
		expect(slug('基調講演')).toBe('');
		expect(slug('---')).toBe('');
	});
});
