import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Question } from '../../protocol';
import { useFilter } from './filter';

function question(overrides: Partial<Question> = {}): Question {
	return {
		id: 'q1',
		text: '質問',
		translation: null,
		votes: 0,
		status: 'published',
		version: 1,
		createdAt: 1,
		asker: null,
		...overrides,
	};
}

describe('useFilter', () => {
	it('starts with everyone shown and answered ones tucked away', () => {
		const { result } = renderHook(() => useFilter(new Set(['mine'])));

		expect(result.current.passes(question({ id: 'mine' }))).toBe(true);
		expect(result.current.passes(question({ id: 'theirs' }))).toBe(true);
		expect(result.current.passes(question({ id: 'theirs', status: 'answered' }))).toBe(false);
		expect(result.current.passes(question({ id: 'mine', status: 'answered' }))).toBe(true);
		expect(result.current.narrowed).toBe(false);
	});

	it('shows only what is checked', () => {
		const { result } = renderHook(() => useFilter(new Set(['mine'])));

		act(() => result.current.setAsker(new Set(['you'])));

		expect(result.current.passes(question({ id: 'mine' }))).toBe(true);
		expect(result.current.passes(question({ id: 'theirs' }))).toBe(false);
		expect(result.current.narrowed).toBe(true);
	});
});
