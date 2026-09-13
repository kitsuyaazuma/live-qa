import { useRef, useState } from 'react';
import * as api from '../api';
import { External, Gear } from '../icons';
import { TRANSLATION_SHOWN, type TranslationShown } from '../translation';
import type { StreamState } from '../use-stream';
import { Modal } from './modal';

const SHOWN: Record<TranslationShown, { label: string; said: string }> = {
	headline: { label: 'Headline', said: 'One direct line, as a peer would ask it out loud.' },
	full: { label: 'Full', said: 'Everything the asker wrote, translated faithfully.' },
	none: { label: 'None', said: 'Only what the asker wrote.' },
};

export function Settings({
	roomId,
	room,
	token,
	shown,
	onShown,
	fromStage = false,
}: {
	roomId: string;
	room: StreamState;
	token: string;
	shown: TranslationShown;
	onShown: (shown: TranslationShown) => void;
	/** The stage has no other way to the admin, so it gets one here. */
	fromStage?: boolean;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
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
				<Gear />
			</button>
			<Modal ref={dialog} title="Settings">
				<label className="flex cursor-pointer items-center justify-between gap-3">
					<span>
						Review before showing
						<span className="block text-xs opacity-70">New questions wait for you.</span>
					</span>
					<input
						type="checkbox"
						className="toggle"
						checked={room.moderated}
						disabled={busy}
						onChange={(event) =>
							void change(() => api.setModeration(roomId, event.target.checked, token))
						}
					/>
				</label>
				<fieldset className="fieldset gap-1 p-0" disabled={!room.translates}>
					<legend className="px-0 text-base font-normal">
						Translation shown
						<span className="block text-xs opacity-70">This screen only.</span>
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
						<External className="size-4" />
					</a>
				)}
			</Modal>
		</>
	);
}
