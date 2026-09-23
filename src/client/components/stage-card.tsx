import {
	Check,
	Eye,
	EyeOff,
	Hourglass,
	Languages,
	type LucideIcon,
	Pin,
	PinOff,
	RotateCcw,
	ThumbsUp,
} from 'lucide-react';
import type { Question, Status, Target } from '../../protocol';
import { ago } from '../time';
import { shownLine, type TranslationShown } from '../translation';
import { Byline } from './byline';
import { GHOST } from './ghost';

interface Move {
	to: Target;
	label: string;
	icon: LucideIcon;
}

/** An answered question goes back to the list, not onto the stage: the usual
 * reason to undo is having marked the wrong one. */
function moves(status: Status, admin: boolean): Move[] {
	const found: Move[] = [];
	if (status === 'answering') {
		found.push({ to: 'published', label: 'Take off the stage', icon: PinOff });
	} else if (status === 'published') {
		found.push({ to: 'answering', label: 'Put on the stage', icon: Pin });
	}
	if (status === 'published' || status === 'answering') {
		found.push({ to: 'answered', label: 'Mark answered', icon: Check });
	}
	if (status === 'answered') {
		found.push({ to: 'published', label: 'Back to the live list', icon: RotateCcw });
	}
	if (admin) {
		if (status === 'pending' || status === 'dismissed') {
			found.push({ to: 'published', label: 'Show to the audience', icon: Eye });
		} else found.push({ to: 'dismissed', label: 'Hide from the audience', icon: EyeOff });
	}
	return found;
}

function TranslationState({ question, translates }: { question: Question; translates: boolean }) {
	const translation = question.translation;
	if (translation === null) {
		if (!translates) return null;
		return (
			<span className="badge badge-ghost badge-sm gap-1">
				<span className="loading loading-spinner loading-xs" />
				translating
			</span>
		);
	}
	if (!translation.ok) {
		return (
			<span className="badge badge-warning badge-soft badge-sm" title={translation.error}>
				not translated
			</span>
		);
	}
	return null;
}

export function StageCard({
	question,
	translates,
	shown,
	admin = false,
	big = false,
	now,
	busy = false,
	full = false,
	onFull,
	onMove,
}: {
	question: Question;
	translates: boolean;
	shown: TranslationShown;
	admin?: boolean;
	big?: boolean;
	now?: number;
	busy?: boolean;
	full?: boolean;
	onFull?: () => void;
	onMove: (to: Target) => void;
}) {
	const line = shownLine(question, shown);
	const active = question.status === 'answering';
	const waiting = question.status === 'pending';
	const below = full && question.translation?.ok ? question.translation.full : question.text;

	return (
		<li
			data-key={question.id}
			className={`card ${
				active
					? 'bg-primary text-primary-content'
					: 'card-border border-base-content/25 bg-base-100'
			} ${waiting ? 'border-dashed' : ''}`}
		>
			<div className={`card-body gap-2 ${big ? 'p-5' : 'p-4'}`}>
				{/* Beside the question the controls would leave it half a column wide. */}
				<div className="flex items-center gap-2">
					{question.asker && <Byline asker={question.asker} big={big} />}
					<div className="ms-auto flex shrink-0 items-center gap-0.5">
						{onFull && (
							<button
								type="button"
								className={`${active ? GHOST : 'btn btn-ghost'} btn-square ${big ? '' : 'btn-sm'}`}
								aria-label={full ? 'Show what the asker wrote' : 'Show the full translation'}
								aria-pressed={full}
								title="Full translation"
								onClick={onFull}
							>
								<Languages className="size-5" />
							</button>
						)}
						{moves(question.status, admin).map((move) => (
							<button
								key={move.to}
								type="button"
								className={`${active ? GHOST : 'btn btn-ghost'} btn-square ${big ? '' : 'btn-sm'}`}
								aria-label={move.label}
								title={move.label}
								disabled={busy}
								onClick={() => onMove(move.to)}
							>
								<move.icon className="size-5" />
							</button>
						))}
						<span
							className={`ml-1 inline-flex items-center gap-1 tabular-nums ${big ? 'text-lg' : 'text-sm'}`}
						>
							<ThumbsUp className="size-4" />
							{question.votes}
							<span className="sr-only">upvotes</span>
						</span>
					</div>
				</div>
				{line && <p className={`font-semibold ${big ? 'text-2xl leading-snug' : ''}`}>{line}</p>}
				<p
					className={`break-words whitespace-pre-wrap ${line ? 'opacity-70' : ''} ${
						big && !line ? 'text-2xl leading-snug' : big ? 'text-base' : 'text-sm'
					}`}
				>
					{below}
				</p>
				{admin && (
					<div className="flex flex-wrap items-center gap-2">
						{waiting && (
							<span className="badge badge-warning badge-soft badge-sm gap-1">
								<Hourglass className="size-3" />
								Waiting for review
							</span>
						)}
						<TranslationState question={question} translates={translates} />
						{now !== undefined && (
							<time
								dateTime={new Date(question.createdAt).toISOString()}
								className="ml-auto text-xs opacity-70"
							>
								{ago(question.createdAt, now)}
							</time>
						)}
					</div>
				)}
			</div>
		</li>
	);
}
