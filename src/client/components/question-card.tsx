import type { Question } from '../../protocol';
import { ThumbsUp } from '../icons';
import { ago } from '../time';
import { shownLine, type TranslationShown } from '../translation';
import { GHOST } from './ghost';

export function QuestionCard({
	question,
	voted,
	mine,
	now,
	shown,
	onVote,
}: {
	question: Question;
	voted: boolean;
	mine: boolean;
	now: number;
	shown: TranslationShown;
	onVote: () => void;
}) {
	const line = shownLine(question, shown);
	const answering = question.status === 'answering';
	const answered = question.status === 'answered';
	const waiting = question.status === 'pending';

	return (
		<li
			data-key={question.id}
			className={`card ${
				answering
					? 'bg-primary text-primary-content'
					: `card-border border-base-content/25 ${answered ? 'bg-base-200' : 'bg-base-100'}`
			}`}
		>
			<div className="card-body gap-2 p-4">
				<p className="break-words whitespace-pre-wrap">{question.text}</p>
				{line && <p className="text-sm opacity-70">{line}</p>}
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={onVote}
						aria-pressed={voted}
						aria-label={voted ? 'Take back your upvote' : 'Upvote this question'}
						className={`btn-sm gap-1.5 ${
							answering
								? `${GHOST} ${voted ? 'bg-current/20' : ''}`
								: voted
									? 'btn btn-secondary'
									: 'btn'
						}`}
					>
						<ThumbsUp className="size-4" />
						<span className="tabular-nums">{question.votes}</span>
					</button>
					{waiting && (
						<span className="badge badge-warning badge-soft badge-sm">Waiting for review</span>
					)}
					{answered && <span className="badge badge-accent badge-soft badge-sm">Answered</span>}
					{mine && <span className="badge badge-secondary badge-soft badge-sm">Yours</span>}
					<time
						dateTime={new Date(question.createdAt).toISOString()}
						className="ml-auto text-xs opacity-70"
					>
						{ago(question.createdAt, now)}
					</time>
				</div>
			</div>
		</li>
	);
}
