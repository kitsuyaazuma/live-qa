import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Question } from '../protocol';
import { shownLine, useTranslationShown } from './translation';

function question(translation: Question['translation']): Question {
	return {
		id: 'q1',
		text: 'エージェント基盤はどの層から着手すべきでしょうか。',
		translation,
		votes: 0,
		status: 'published',
		version: 1,
		createdAt: 1,
	};
}

const translated = question({ ok: true, headline: 'Which layer first?', full: 'Where to start?' });

describe('shownLine', () => {
	it('gives the line the screen asked for', () => {
		expect(shownLine(translated, 'headline')).toBe('Which layer first?');
		expect(shownLine(translated, 'full')).toBe('Where to start?');
		expect(shownLine(translated, 'none')).toBeNull();
	});

	it('falls back to the full line rather than leaving the original alone', () => {
		const headless = question({ ok: true, headline: null, full: 'Where to start?' });

		expect(shownLine(headless, 'headline')).toBe('Where to start?');
	});

	it('has nothing to show for a question the model could not handle', () => {
		expect(shownLine(question(null), 'headline')).toBeNull();
		expect(shownLine(question({ ok: false, error: 'timed out', attempts: 1 }), 'full')).toBeNull();
	});
});

describe('useTranslationShown', () => {
	beforeEach(() => localStorage.clear());

	it('starts on the headline the speaker reads aloud', () => {
		expect(renderHook(() => useTranslationShown()).result.current[0]).toBe('headline');
	});

	it("is this browser's own choice, and outlives the screen", () => {
		const first = renderHook(() => useTranslationShown());
		act(() => first.result.current[1]('full'));

		expect(first.result.current[0]).toBe('full');
		expect(renderHook(() => useTranslationShown()).result.current[0]).toBe('full');
	});
});
