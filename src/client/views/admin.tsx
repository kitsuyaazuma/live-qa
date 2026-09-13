import { useMemo, useRef, useState } from 'react';
import type { Question, Status } from '../../protocol';
import * as api from '../api';
import { Operator } from '../components/operator';
import { Page } from '../components/page';
import { Settings } from '../components/settings';
import { Share } from '../components/share';
import { StageCard } from '../components/stage-card';
import { Presentation } from '../icons';
import { byOldest, forStage } from '../order';
import { Link } from '../router';
import { useNow } from '../time';
import { useTranslationShown } from '../translation';
import { useFlip } from '../use-flip';
import type { StreamState } from '../use-stream';

type Lane = 'review' | 'live' | 'answered' | 'hidden';

const LANES: Record<Lane, { label: string; holds: Status[] }> = {
	review: { label: 'Review', holds: ['pending'] },
	live: { label: 'Live', holds: ['answering', 'published'] },
	answered: { label: 'Answered', holds: ['answered'] },
	hidden: { label: 'Hidden', holds: ['dismissed'] },
};

/** Review is oldest first, so nothing waits forever. */
function inLane(questions: Question[], lane: Lane): Question[] {
	return questions
		.filter((question) => LANES[lane].holds.includes(question.status))
		.sort(lane === 'review' ? byOldest : forStage);
}

export default function Admin({ roomId }: { roomId: string }) {
	return (
		<Operator roomId={roomId}>
			{(room, token) => <AdminScreen roomId={roomId} room={room} token={token} />}
		</Operator>
	);
}

function AdminScreen({
	roomId,
	room,
	token,
}: {
	roomId: string;
	room: StreamState;
	token: string;
}) {
	const [lane, setLane] = useState<Lane>('live');
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const now = useNow();
	const [shown, setShown] = useTranslationShown();
	const list = useRef<HTMLOListElement>(null);

	const lanes = useMemo(
		() =>
			Object.fromEntries(
				(Object.keys(LANES) as Lane[]).map((name) => [name, inLane(room.questions, name)]),
			) as Record<Lane, Question[]>,
		[room.questions],
	);
	const offered = (Object.keys(LANES) as Lane[]).filter(
		(name) => name !== 'review' || room.moderated || lanes.review.length > 0,
	);
	const listed = lanes[offered.includes(lane) ? lane : 'live'];
	useFlip(list);

	async function move(question: Question, to: Exclude<Status, 'pending'>) {
		setBusy(question.id);
		try {
			await api.setStatus(roomId, question.id, to, token);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'that did not go through');
		} finally {
			setBusy(null);
		}
	}

	return (
		<Page width="max-w-3xl" connection={room.connection}>
			<div className="flex items-center gap-2">
				<Share roomId={roomId} />
				<Link to={`/r/${roomId}/present`} className="btn btn-primary gap-2">
					<Presentation />
					Present
				</Link>
				<span className="ml-auto">
					<Settings roomId={roomId} room={room} token={token} shown={shown} onShown={setShown} />
				</span>
			</div>

			<div role="tablist" className="tabs tabs-border tabs-sm self-start">
				{offered.map((name) => (
					<button
						key={name}
						type="button"
						role="tab"
						aria-selected={lane === name}
						className={`tab ${lane === name ? 'tab-active' : ''}`}
						onClick={() => setLane(name)}
					>
						{LANES[name].label}
						{lanes[name].length > 0 && (
							<span className="badge badge-ghost badge-sm ml-1.5">{lanes[name].length}</span>
						)}
					</button>
				))}
			</div>

			{listed.length === 0 ? (
				<p className="py-10 text-center opacity-70">Nothing here.</p>
			) : (
				<ol ref={list} aria-label="Questions" className="flex flex-col gap-2">
					{listed.map((question) => (
						<StageCard
							key={question.id}
							question={question}
							translates={room.translates}
							shown={shown}
							admin
							now={now}
							busy={busy === question.id}
							onMove={(to) => void move(question, to)}
						/>
					))}
				</ol>
			)}

			{error && (
				<div className="toast toast-center toast-bottom">
					<div role="alert" className="alert alert-error">
						<span>{error}</span>
						<button type="button" className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
							Dismiss
						</button>
					</div>
				</div>
			)}
		</Page>
	);
}
