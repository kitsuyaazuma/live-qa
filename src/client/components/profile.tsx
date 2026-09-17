import { type Ref, useState } from 'react';
import { type Me, NAME_MAX } from '../../protocol';
import * as api from '../api';
import { updateMe } from '../use-me';
import { Modal } from './modal';

/** Square, small, and encoded here, so the worker stores a few kilobytes and
 * never has to look inside an image. */
const SIDE = 128;

async function shrink(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement('canvas');
	canvas.width = SIDE;
	canvas.height = SIDE;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('this browser cannot draw the picture');
	context.drawImage(
		bitmap,
		(bitmap.width - side) / 2,
		(bitmap.height - side) / 2,
		side,
		side,
		0,
		0,
		SIDE,
		SIDE,
	);
	bitmap.close();
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('could not encode the picture'))),
			'image/webp',
			0.85,
		);
	});
}

function said(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

export function Profile({ ref, me }: { ref: Ref<HTMLDialogElement>; me: Me }) {
	const [name, setName] = useState(me.account.name);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { avatar } = me.account;
	const uploaded = avatar?.startsWith('/api/avatars/') ?? false;
	const trimmed = name.trim();

	async function change(action: () => Promise<Me>) {
		setBusy(true);
		setError(null);
		try {
			updateMe(await action());
		} catch (cause) {
			setError(said(cause, 'that did not go through'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal ref={ref} title="Your profile">
			<div className="flex items-center gap-4">
				<div className={`avatar ${avatar ? '' : 'avatar-placeholder'}`}>
					<div className="bg-base-200 text-base-content w-16 rounded-full text-xl">
						{avatar ? (
							<img src={avatar} alt="" referrerPolicy="no-referrer" />
						) : (
							me.account.name.slice(0, 1)
						)}
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<label className="btn btn-sm">
						{busy ? <span className="loading loading-spinner loading-xs" /> : 'Choose a picture'}
						<input
							type="file"
							accept="image/*"
							className="hidden"
							disabled={busy}
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = '';
								if (file) void change(async () => api.uploadAvatar(await shrink(file)));
							}}
						/>
					</label>
					{uploaded && (
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							disabled={busy}
							onClick={() => void change(api.dropAvatar)}
						>
							Back to my {me.account.provider === 'github' ? 'GitHub' : 'Google'} picture
						</button>
					)}
				</div>
			</div>
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (trimmed && trimmed !== me.account.name) void change(() => api.rename(trimmed));
				}}
			>
				<label className="flex flex-col gap-1">
					<span className="text-sm">Shown with your questions</span>
					<input
						className="input w-full"
						value={name}
						maxLength={NAME_MAX}
						autoComplete="nickname"
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<button
					type="submit"
					className="btn btn-primary btn-sm self-start"
					disabled={busy || !trimmed || trimmed === me.account.name}
				>
					Save name
				</button>
			</form>
			{error && (
				<p role="alert" className="text-error text-sm">
					{error}
				</p>
			)}
		</Modal>
	);
}
