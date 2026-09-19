import { describe, expect, it } from 'vitest';
import { toCsv } from './export';
import type { Question } from './protocol';

function question(overrides: Partial<Question>): Question {
	return {
		id: 'q',
		text: 'text',
		translation: null,
		votes: 0,
		status: 'published',
		version: 1,
		createdAt: Date.UTC(2026, 8, 19, 5, 0, 0),
		asker: null,
		...overrides,
	};
}

describe('toCsv', () => {
	it('quotes what would break a row and leaves the rest bare', () => {
		const csv = toCsv([
			question({
				id: 'q2',
				text: 'Says "hi",\nthen leaves',
				votes: 3,
				asker: { name: 'Mika', avatar: null },
				translation: { ok: true, headline: 'Hi', full: 'Says hi, then leaves' },
				createdAt: Date.UTC(2026, 8, 19, 5, 1, 0),
			}),
			question({ id: 'q1', translation: { ok: false, error: 'refused', attempts: 3 } }),
		]);

		expect(csv).toBe(
			'﻿id,created_at,status,votes,asker,text,headline,translation\r\n' +
				'q1,2026-09-19T05:00:00.000Z,published,0,,text,,\r\n' +
				'q2,2026-09-19T05:01:00.000Z,published,3,Mika,"Says ""hi"",\nthen leaves",Hi,"Says hi, then leaves"\r\n',
		);
	});
});
