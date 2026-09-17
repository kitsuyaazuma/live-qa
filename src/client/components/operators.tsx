import { useEffect, useState } from 'react';
import { type Operator, requireEmail } from '../../protocol';
import * as api from '../api';
import { navigate } from '../router';

function said(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

function plausible(email: string): boolean {
	try {
		requireEmail(email);
		return true;
	} catch {
		return false;
	}
}

export function Operators({ roomId }: { roomId: string }) {
	const [list, setList] = useState<Operator[] | null>(null);
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void api.operators(roomId).then(setList, (cause) => setError(said(cause, 'could not load')));
	}, [roomId]);

	async function change(action: () => Promise<Operator[]>) {
		setBusy(true);
		setError(null);
		try {
			setList(await action());
			setEmail('');
		} catch (cause) {
			setError(said(cause, 'that did not go through'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<fieldset className="fieldset gap-2 p-0">
			<legend className="px-0 text-base font-normal">
				Operators
				<span className="block text-xs opacity-70">
					Signed in with one of these addresses, they can run this room.
				</span>
			</legend>
			{list === null ? (
				<span className="loading loading-spinner loading-sm" />
			) : list.length === 0 ? (
				<p className="text-xs opacity-70">Only admins so far.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{list.map((operator) => (
						<li key={operator.email} className="flex items-center justify-between gap-2 text-sm">
							<span className="truncate">{operator.email}</span>
							<button
								type="button"
								className="btn btn-ghost btn-xs"
								disabled={busy}
								onClick={() => void change(() => api.setOperator(roomId, operator.email, false))}
							>
								Remove
							</button>
						</li>
					))}
				</ul>
			)}
			<form
				className="join"
				onSubmit={(event) => {
					event.preventDefault();
					if (plausible(email)) void change(() => api.setOperator(roomId, email, true));
				}}
			>
				<input
					type="email"
					className="input input-sm join-item w-full"
					placeholder="name@example.com"
					aria-label="Operator email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
				<button type="submit" className="btn btn-sm join-item" disabled={busy || !plausible(email)}>
					Add
				</button>
			</form>
			{error && (
				<p role="alert" className="text-error text-sm">
					{error}
				</p>
			)}
		</fieldset>
	);
}

export function DeleteRoom({ roomId }: { roomId: string }) {
	const [arming, setArming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function remove() {
		setBusy(true);
		try {
			await api.deleteRoom(roomId);
			navigate('/');
		} catch (cause) {
			setError(said(cause, 'that did not go through'));
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			{arming ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span>
						Delete <span className="font-medium">{roomId}</span> and every question in it?
					</span>
					<button type="button" className="btn btn-error btn-sm" disabled={busy} onClick={remove}>
						Delete
					</button>
					<button type="button" className="btn btn-ghost btn-sm" onClick={() => setArming(false)}>
						Keep
					</button>
				</div>
			) : (
				<button
					type="button"
					className="btn btn-outline btn-error btn-sm self-start"
					onClick={() => setArming(true)}
				>
					Delete this room
				</button>
			)}
			{error && (
				<p role="alert" className="text-error text-sm">
					{error}
				</p>
			)}
		</div>
	);
}
