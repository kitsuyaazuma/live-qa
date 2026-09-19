import branding from '@branding/branding.json';
import { Megaphone } from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import * as api from '../api';
import { Banner } from '../components/banner';
import { Fullscreen } from '../components/fullscreen';
import { Operator } from '../components/operator';
import { Settings } from '../components/settings';
import { StageCard } from '../components/stage-card';
import { forStage } from '../order';
import { useTranslationShown } from '../translation';
import { useFlip } from '../use-flip';
import type { StreamState } from '../use-stream';

const Qr = lazy(() => import('../components/qr'));

const ON_STAGE = 6;

/** May break after a dot or a slash, never inside a word. */
function Address({ link }: { link: string }) {
	const pieces = link.replace(/^https?:\/\//, '').split(/(?<=[./])/);
	return (
		<p className="text-2xl font-semibold">
			{pieces.map((piece, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: pieces repeat, positions do not
				<span key={index}>
					{piece}
					<wbr />
				</span>
			))}
		</p>
	);
}

export default function Present({ roomId }: { roomId: string }) {
	return <Operator roomId={roomId}>{(room) => <Stage roomId={roomId} room={room} />}</Operator>;
}

/** Pinned to the brand theme by a checked controller; with no header here,
 * nothing competes with it. */
function Stage({ roomId, room }: { roomId: string; room: StreamState }) {
	const list = useRef<HTMLOListElement>(null);
	const [shown, setShown] = useTranslationShown();
	const listed = room.questions
		.filter((question) => question.status === 'published' || question.status === 'answering')
		.sort(forStage)
		.slice(0, ON_STAGE);
	useFlip(list);
	const link = `${location.origin}/r/${roomId}`;

	return (
		<div className="relative min-h-dvh">
			<input
				type="radio"
				name="stage-theme"
				value={branding.theme}
				className="theme-controller hidden"
				checked
				readOnly
			/>
			<div className="absolute bottom-4 left-4 z-10 flex gap-1">
				<Fullscreen />
				<Settings roomId={roomId} room={room} shown={shown} onShown={setShown} fromStage />
			</div>

			<div className="grid min-h-dvh gap-8 p-6 lg:grid-cols-[minmax(16rem,26%)_1fr] lg:gap-12 lg:p-10">
				<aside className="flex flex-col items-center gap-6 text-center">
					<Banner fit="width" className="w-2/3 max-w-52" />
					<Suspense fallback={<div className="skeleton aspect-square w-full max-w-xs" />}>
						<Qr text={link} className="rounded-box w-full max-w-xs" />
					</Suspense>
					<div>
						<p className="text-lg opacity-70">Join at</p>
						<Address link={link} />
					</div>
					{room.notice && (
						<p role="status" className="alert alert-info alert-soft w-full text-left text-lg">
							<Megaphone className="size-6 shrink-0" />
							<span>{room.notice}</span>
						</p>
					)}
					{room.connection !== 'live' && (
						<span className="badge badge-warning badge-soft">not live</span>
					)}
					{!room.open && <span className="badge badge-soft">closed to new questions</span>}
				</aside>

				<main className="min-w-0">
					{listed.length === 0 ? (
						<p className="py-10 text-3xl opacity-70">Waiting for the first question.</p>
					) : (
						<ol ref={list} aria-label="Questions on the stage" className="flex flex-col gap-3">
							{listed.map((question) => (
								<StageCard
									key={question.id}
									question={question}
									translates={room.translates}
									shown={shown}
									big
									onMove={(to) => void api.setStatus(roomId, question.id, to).catch(() => {})}
								/>
							))}
						</ol>
					)}
				</main>
			</div>
		</div>
	);
}
