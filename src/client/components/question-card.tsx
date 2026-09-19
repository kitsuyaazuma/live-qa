import { CircleCheck, Hourglass, ThumbsUp, Trash2, UserRound } from 'lucide-react';
import type { Question } from '../../protocol';
import { ago } from '../time';
import { shownLine, type TranslationShown } from '../translation';
import { Byline } from './byline';
import { GHOST } from './ghost';

export function QuestionCard({
	question,
	voted,
	mine,
	now,
	shown,
	onVote,
	onWithdraw,
}: {
	question: Question;
	voted: boolean;
	mine: boolean;
	now: number;
	shown: TranslationShown;
	onVote: () => void;
	/** Offered only to the asker, and only while the question can still go. */
	onWithdraw?: () => void;
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
				{question.asker && <Byline asker={question.asker} />}
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
						<ThumbsUp className="size-4" fill={voted ? 'currentColor' : 'none'} />
						<span className="tabular-nums">{question.votes}</span>
					</button>
					{waiting && (
						<span className="badge badge-warning badge-soft badge-sm gap-1">
							<Hourglass className="size-3" />
							Waiting for review
						</span>
					)}
					{answered && (
						<span className="badge badge-accent badge-soft badge-sm gap-1">
							<CircleCheck className="size-3" />
							Answered
						</span>
					)}
					{mine && (
						<span className="badge badge-secondary badge-soft badge-sm gap-1">
							<UserRound className="size-3" />
							Yours
						</span>
					)}
					{onWithdraw && (
						<button
							type="button"
							className={`btn-sm gap-1.5 ${answering ? GHOST : 'btn btn-ghost'}`}
							aria-label="Take your question back"
							onClick={onWithdraw}
						>
							<Trash2 className="size-4" />
							Take back
						</button>
					)}
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
