import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Question } from '../../protocol';
import { StageCard } from './stage-card';

afterEach(cleanup);

const QUESTION: Question = {
	id: 'q1',
	text: '原文はこちら。',
	translation: { ok: true, headline: 'The headline', full: 'The whole thing, faithfully.' },
	votes: 0,
	status: 'answering',
	version: 1,
	createdAt: 1,
	asker: null,
};

describe('StageCard', () => {
	it('puts the full translation under the headline in place of the original', () => {
		const { rerender } = render(
			<StageCard
				question={QUESTION}
				translates
				shown="headline"
				big
				onFull={() => {}}
				onMove={() => {}}
			/>,
		);

		expect(screen.getByText('The headline')).toBeTruthy();
		expect(screen.getByText('原文はこちら。')).toBeTruthy();

		rerender(
			<StageCard
				question={QUESTION}
				translates
				shown="headline"
				big
				full
				onFull={() => {}}
				onMove={() => {}}
			/>,
		);

		expect(screen.getByText('The headline')).toBeTruthy();
		expect(screen.getByText('The whole thing, faithfully.')).toBeTruthy();
		expect(screen.queryByText('原文はこちら。')).toBeNull();
	});

	it('offers the swap only where it was handed a way to do it', () => {
		render(<StageCard question={QUESTION} translates shown="headline" big onMove={() => {}} />);

		expect(screen.queryByLabelText('Show the full translation')).toBeNull();
	});
});
