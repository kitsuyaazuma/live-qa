import { CircleCheck, Hourglass, ThumbsUp, Trash2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
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
	onPrepare,
	check,
	fresh = false,
}: {
	question: Question;
	voted: boolean;
	mine: boolean;
	now: number;
	shown: TranslationShown;
	/** Just sent from this browser: lit up for a moment so the eye finds it. */
	fresh?: boolean;
	onVote: () => void;
	/** Offered only to the asker, and only while the question can still go. */
	onWithdraw?: () => void;
	onPrepare?: () => void;
	/** The device check, drawn in the card while a write on it waits. */
	check?: ReactNode;
}) {
	const line = shownLine(question, shown);
	const answering = question.status === 'answering';
	const answered = question.status === 'answered';
	const waiting = question.status === 'pending';
	const hidden = question.status === 'dismissed';

	return (
		<li
			data-key={question.id}
			className={`card transition-shadow duration-500 ${
				answering
					? 'bg-primary text-primary-content'
					: `card-border border-base-content/25 ${answered ? 'bg-base-200' : 'bg-base-100'}`
			} ${fresh ? 'ring-secondary ring-offset-base-100 ring-2 ring-offset-2' : ''}`}
		>
			<div className="card-body gap-2 p-4">
				{question.asker && <Byline asker={question.asker} />}
				{hidden ? (
					<p className="text-sm italic opacity-70">Not shown by the operators.</p>
				) : (
					<p className="break-words whitespace-pre-wrap">{question.text}</p>
				)}
				{line && <p className="text-sm opacity-70">{line}</p>}
				<div className="flex flex-wrap items-center gap-2">
					{!hidden && (
						<button
							type="button"
							onClick={onVote}
							onPointerDown={onPrepare}
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
					)}
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
				{check}
			</div>
		</li>
	);
}
