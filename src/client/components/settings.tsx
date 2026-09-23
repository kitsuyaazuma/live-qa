import {
	Archive,
	DoorClosed,
	DoorOpen,
	Download,
	ExternalLink,
	FileDown,
	Hourglass,
	Languages,
	Megaphone,
	Settings as SettingsIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NOTICE_MAX } from '../../protocol';
import * as api from '../api';
import { TRANSLATION_SHOWN, type TranslationShown } from '../translation';
import { useMe } from '../use-me';
import type { StreamState } from '../use-stream';
import { Modal } from './modal';
import { Admins, DeleteRoom, Operators } from './operators';
import { Title } from './title';

function Notice({
	roomId,
	current,
	onError,
}: {
	roomId: string;
	current: string;
	onError: (said: string) => void;
}) {
	const [draft, setDraft] = useState(current);
	const [busy, setBusy] = useState(false);
	// Another screen's edit arrives through the stream and replaces an untouched draft.
	useEffect(() => setDraft(current), [current]);

	async function save(event: { preventDefault: () => void }) {
		event.preventDefault();
		setBusy(true);
		try {
			await api.setNotice(roomId, draft);
		} catch (cause) {
			onError(cause instanceof Error ? cause.message : 'that did not go through');
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="flex flex-col gap-2" onSubmit={save}>
			<label htmlFor="notice" className="text-base">
				<Title
					icon={Megaphone}
					text="Notice"
					said="One line on every screen. Empty takes it down."
				/>
			</label>
			<div className="join">
				<input
					id="notice"
					type="text"
					className="input input-sm join-item w-full"
					placeholder="Q&A starts at 14:00"
					maxLength={NOTICE_MAX}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
				/>
				<button
					type="submit"
					className="btn btn-sm join-item"
					disabled={busy || draft.trim() === current}
				>
					{current && draft.trim() === '' ? 'Take down' : 'Show'}
				</button>
			</div>
		</form>
	);
}

/** Two steps, like deleting the room: one tap here empties every screen in the hall. */
function NextTalk({ roomId, onError }: { roomId: string; onError: (said: string) => void }) {
	const [arming, setArming] = useState(false);
	const [busy, setBusy] = useState(false);

	async function clear() {
		setBusy(true);
		try {
			await api.archive(roomId);
			setArming(false);
		} catch (cause) {
			onError(cause instanceof Error ? cause.message : 'that did not go through');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<p className="text-base">
				<Title
					icon={Archive}
					text="Next talk"
					said="Takes every question off the screens. The export keeps them."
				/>
			</p>
			{arming ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span>Archive every question in this room?</span>
					<button type="button" className="btn btn-sm" disabled={busy} onClick={clear}>
						Archive
					</button>
					<button type="button" className="btn btn-ghost btn-sm" onClick={() => setArming(false)}>
						Keep
					</button>
				</div>
			) : (
				<button type="button" className="btn btn-sm self-start" onClick={() => setArming(true)}>
					Clear the room
				</button>
			)}
		</div>
	);
}

const SHOWN: Record<TranslationShown, { label: string; said: string }> = {
	headline: { label: 'Headline', said: 'One direct line, as a peer would ask it out loud.' },
	full: { label: 'Full', said: 'Everything the asker wrote, translated faithfully.' },
	none: { label: 'None', said: 'Only what the asker wrote.' },
};

export function Settings({
	roomId,
	room,
	shown,
	onShown,
	fromStage = false,
}: {
	roomId: string;
	room: StreamState;
	shown: TranslationShown;
	onShown: (shown: TranslationShown) => void;
	/** The stage has no other way to the admin, so it gets one here. */
	fromStage?: boolean;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const me = useMe();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function change(action: () => Promise<unknown>) {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'that did not go through');
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<button
				type="button"
				className="btn btn-ghost btn-square"
				aria-label="Settings"
				onClick={() => dialog.current?.showModal()}
			>
				<SettingsIcon className="size-5" />
			</button>
			<Modal ref={dialog} title="Settings">
				<label className="flex cursor-pointer items-center justify-between gap-3">
					<span>
						<Title
							icon={room.open ? DoorOpen : DoorClosed}
							text="Accepting questions"
							said="Off keeps the list up and takes no new ones."
						/>
					</span>
					<input
						type="checkbox"
						className="toggle"
						checked={room.open}
						disabled={busy}
						onChange={(event) => void change(() => api.setOpen(roomId, event.target.checked))}
					/>
				</label>
				<label className="flex cursor-pointer items-center justify-between gap-3">
					<span>
						<Title
							icon={Hourglass}
							text="Review before showing"
							said="New questions wait for you."
						/>
					</span>
					<input
						type="checkbox"
						className="toggle"
						checked={room.moderated}
						disabled={busy}
						onChange={(event) => void change(() => api.setModeration(roomId, event.target.checked))}
					/>
				</label>
				<Notice roomId={roomId} current={room.notice} onError={setError} />
				<NextTalk roomId={roomId} onError={setError} />
				<fieldset className="fieldset gap-1 p-0" disabled={!room.translates}>
					<legend className="px-0 text-base font-normal">
						<Title icon={Languages} text="Translation shown" said="This screen only." />
					</legend>
					{TRANSLATION_SHOWN.map((value) => (
						<label key={value} className="flex cursor-pointer items-start gap-3 py-1">
							<input
								type="radio"
								name="translation-shown"
								className="radio radio-sm mt-0.5"
								value={value}
								checked={shown === value}
								onChange={() => onShown(value)}
							/>
							<span>
								{SHOWN[value].label}
								<span className="block text-xs opacity-70">{SHOWN[value].said}</span>
							</span>
						</label>
					))}
					{!room.translates && (
						<p className="text-xs opacity-70">This room has no translator configured.</p>
					)}
				</fieldset>
				<div className="flex flex-col gap-2">
					<p className="text-base">
						<Title
							icon={FileDown}
							text="Export"
							said="Every question with its votes, status and translation."
						/>
					</p>
					<a
						href={`/api/rooms/${encodeURIComponent(roomId)}/export`}
						download
						className="btn btn-sm self-start gap-1.5"
					>
						<Download className="size-4" />
						Download as CSV
					</a>
				</div>
				{me?.admin && (
					<>
						<Admins />
						<Operators roomId={roomId} />
					</>
				)}
				{error && (
					<p role="alert" className="text-error text-sm">
						{error}
					</p>
				)}
				{fromStage && (
					<a
						href={`/r/${roomId}/admin`}
						target="_blank"
						rel="noreferrer"
						className="btn btn-sm self-start gap-1.5"
					>
						Open the admin in a new tab
						<ExternalLink className="size-4" />
					</a>
				)}
				{me?.admin && <DeleteRoom roomId={roomId} />}
			</Modal>
		</>
	);
}
