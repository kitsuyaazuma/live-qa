import { Clock, Flame, Lock, Megaphone, MessageSquare, MessageSquareDashed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Question, type Status, withdrawable } from '../../protocol';
import { AdminLink } from '../components/admin-link';
import { AskForm } from '../components/ask-form';
import { BackToTop } from '../components/back-to-top';
import { Challenge } from '../components/challenge';
import { Filter, useFilter } from '../components/filter';
import { Page } from '../components/page';
import { QuestionCard } from '../components/question-card';
import { byNewest, byVotes } from '../order';
import { Link } from '../router';
import { useNow } from '../time';
import { useFlip } from '../use-flip';
import { useRoom, type WriteSite } from '../use-room';

type Order = 'popular' | 'recent';

/** How long a question just sent stays lit. */
const FRESH_MS = 1500;

const RANK: Record<Status, number> = {
	answering: 0,
	published: 1,
	pending: 1,
	answered: 2,
	dismissed: 3,
	archived: 3,
	withdrawn: 3,
};

function ordered(questions: Question[], order: Order): Question[] {
	const then = order === 'popular' ? byVotes : byNewest;
	return [...questions].sort((a, b) => RANK[a.status] - RANK[b.status] || then(a, b));
}

export function Participant({ roomId }: { roomId: string }) {
	const room = useRoom(roomId);
	const [order, setOrder] = useState<Order>('popular');
	const [justAsked, setJustAsked] = useState<string | null>(null);
	const filter = useFilter(room.asked);
	const now = useNow();
	const list = useRef<HTMLUListElement>(null);
	const questions = useMemo(
		() => ordered(room.questions.filter(filter.passes), order),
		[room.questions, order, filter.passes],
	);
	useFlip(list);

	// In the popular order a new question lands at the bottom, out of sight on a long list.
	useEffect(() => {
		if (!justAsked) return;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		list.current
			?.querySelector(`[data-key="${justAsked}"]`)
			?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
		const timer = setTimeout(() => setJustAsked(null), FRESH_MS);
		return () => clearTimeout(timer);
	}, [justAsked]);

	const ask = async (text: string, named: boolean) => {
		const id = await room.ask(text, named);
		setJustAsked(id);
		return id;
	};

	const checkAt = (at: WriteSite) => {
		const pending = room.challenge;
		if (!pending || pending.at.kind !== at.kind) return undefined;
		if (at.kind === 'question' && pending.at.kind === 'question' && pending.at.id !== at.id) {
			return undefined;
		}
		return <Challenge sitekey={pending.sitekey} onToken={pending.pass} onCancel={pending.cancel} />;
	};

	if (room.missing) {
		return (
			<Page width="max-w-2xl">
				<div className="flex flex-col items-center gap-2 py-16 text-center">
					<p className="text-lg">
						There is no room called <span className="font-medium">{roomId}</span>.
					</p>
					<p className="text-sm opacity-70">Check the link, or ask whoever runs the event.</p>
					<Link to="/" className="btn btn-sm mt-4">
						Home
					</Link>
				</div>
			</Page>
		);
	}

	return (
		<Page width="max-w-2xl" connection={room.connection} actions={<AdminLink roomId={roomId} />}>
			{room.notice && (
				<div role="status" className="alert alert-info alert-soft">
					<Megaphone className="size-5 shrink-0" />
					<span>{room.notice}</span>
				</div>
			)}
			{room.open ? (
				<AskForm
					moderated={room.moderated}
					onAsk={ask}
					onPrepare={() => room.prepare({ kind: 'ask' })}
					check={checkAt({ kind: 'ask' })}
				/>
			) : (
				<p
					role="status"
					className="bg-base-200 rounded-box flex items-center justify-center gap-2 px-4 py-3 text-sm"
				>
					<Lock className="size-4 shrink-0" />
					This room is closed to new questions.
				</p>
			)}

			<div className="flex items-center justify-between gap-2">
				<div role="tablist" className="tabs tabs-border tabs-sm">
					{(['popular', 'recent'] as const).map((value) => (
						<button
							key={value}
							type="button"
							role="tab"
							aria-selected={order === value}
							className={`tab gap-1.5 ${order === value ? 'tab-active' : ''}`}
							onClick={() => setOrder(value)}
						>
							{value === 'popular' ? <Flame className="size-4" /> : <Clock className="size-4" />}
							{value === 'popular' ? 'Popular' : 'Recent'}
						</button>
					))}
				</div>
				<div className="flex items-center gap-2">
					<span
						aria-live="polite"
						className="inline-flex items-center gap-1 text-xs tabular-nums opacity-70"
					>
						<MessageSquare className="size-3.5" />
						{questions.length}
						<span className="sr-only">{questions.length === 1 ? 'question' : 'questions'}</span>
					</span>
					<Filter filter={filter} asked={room.asked.size} />
				</div>
			</div>

			{room.connection === 'opening' && questions.length === 0 ? (
				<div className="flex flex-col gap-2" aria-hidden="true">
					<div className="skeleton h-20 w-full" />
					<div className="skeleton h-20 w-full" />
				</div>
			) : questions.length === 0 ? (
				<div className="flex flex-col items-center gap-3 py-10 opacity-70">
					<MessageSquareDashed className="size-10" strokeWidth={1.5} />
					<p>No questions yet. Ask the first one.</p>
				</div>
			) : (
				<ul ref={list} aria-label="Questions" className="flex flex-col gap-2">
					{questions.map((question) => (
						<QuestionCard
							key={question.id}
							question={question}
							voted={room.voted.has(question.id)}
							mine={room.asked.has(question.id)}
							fresh={question.id === justAsked}
							now={now}
							shown="headline"
							onVote={() => void room.toggleVote(question.id)}
							onPrepare={() => room.prepare({ kind: 'question', id: question.id })}
							check={checkAt({ kind: 'question', id: question.id })}
							onWithdraw={
								room.asked.has(question.id) && withdrawable(question, now)
									? () => void room.withdraw(question.id)
									: undefined
							}
						/>
					))}
				</ul>
			)}

			{room.error && (
				<div className="toast toast-center toast-bottom">
					<div role="alert" className="alert alert-error">
						<span>{room.error}</span>
						<button type="button" className="btn btn-ghost btn-xs" onClick={room.dismissError}>
							Dismiss
						</button>
					</div>
				</div>
			)}

			<BackToTop />
		</Page>
	);
}
