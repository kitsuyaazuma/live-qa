import { ChevronDown, type LucideIcon, ShieldUser, Trash2, Users } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { EMAIL_MAX, EMAIL_PATTERN, isScratch, type Operator, requireEmail } from '../../protocol';
import * as api from '../api';
import { navigate } from '../router';
import { useMe } from '../use-me';
import { Title } from './title';

function reason(cause: unknown, fallback: string): string {
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

const ROWS = 'divide-base-content/10 border-base-content/20 rounded-box divide-y border text-sm';

const HINT = 'operator-email-hint';

/** Shut until asked for: the stage opens these settings on a screen in the hall. */
function Roster({
	icon,
	text,
	said,
	count,
	children,
}: {
	icon: LucideIcon;
	text: string;
	said: string;
	count: number | null;
	children: ReactNode;
}) {
	return (
		<details className="group">
			<summary className="cursor-pointer list-none text-base [&::-webkit-details-marker]:hidden">
				<Title icon={icon} text={text} said={said}>
					{count !== null && <span className="badge badge-ghost badge-sm">{count}</span>}
					<ChevronDown className="ms-auto size-4 transition-transform group-open:rotate-180" />
				</Title>
			</summary>
			<div className="flex flex-col gap-2 pt-2">{children}</div>
		</details>
	);
}

export function Admins() {
	const admins = useMe()?.admins ?? [];
	if (admins.length === 0) return null;

	return (
		<Roster
			icon={ShieldUser}
			text="Admins"
			said="Set where the app is deployed. They can run every room."
			count={admins.length}
		>
			<ul className={ROWS}>
				{admins.map((email) => (
					<li key={email} className="truncate px-3 py-1.5">
						{email}
					</li>
				))}
			</ul>
		</Roster>
	);
}

export function Operators({ roomId }: { roomId: string }) {
	const [list, setList] = useState<Operator[] | null>(null);
	const [email, setEmail] = useState('');
	const [touched, setTouched] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scratch = isScratch(roomId);
	const wrong = touched && email.length > 0 && !plausible(email);

	useEffect(() => {
		if (scratch) return;
		void api.operators(roomId).then(setList, (cause) => setError(reason(cause, 'could not load')));
	}, [roomId, scratch]);

	async function change(action: () => Promise<Operator[]>) {
		setBusy(true);
		setError(null);
		try {
			setList(await action());
			setEmail('');
		} catch (cause) {
			setError(reason(cause, 'that did not go through'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Roster
			icon={Users}
			text="Operators"
			said="Signed in with one of these addresses, they can run this room."
			count={list?.length ?? null}
		>
			{scratch ? (
				<p className="text-xs opacity-70">A scratch room has none, and takes none.</p>
			) : (
				<>
					{list === null && !error && <span className="loading loading-spinner loading-sm" />}
					{list?.length === 0 && <p className="text-xs opacity-70">Only admins so far.</p>}
					{!!list?.length && (
						<ul className={ROWS}>
							{list.map((operator) => (
								<li
									key={operator.email}
									className="flex items-center justify-between gap-2 py-1 ps-3 pe-1"
								>
									<span className="truncate">{operator.email}</span>
									<button
										type="button"
										className="btn btn-ghost btn-square btn-xs"
										aria-label={`Remove ${operator.email}`}
										title="Remove"
										disabled={busy}
										onClick={() =>
											void change(() => api.setOperator(roomId, operator.email, false))
										}
									>
										<Trash2 className="size-4" />
									</button>
								</li>
							))}
						</ul>
					)}
					<form
						onSubmit={(event) => {
							event.preventDefault();
							if (plausible(email)) void change(() => api.setOperator(roomId, email, true));
						}}
					>
						<div className="join w-full">
							<input
								type="email"
								pattern={EMAIL_PATTERN}
								maxLength={EMAIL_MAX}
								className={`input input-sm join-item w-full ${wrong ? 'input-error' : ''}`}
								placeholder="name@example.com"
								aria-label="Operator email"
								aria-invalid={wrong}
								aria-describedby={wrong ? HINT : undefined}
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								onBlur={() => setTouched(true)}
							/>
							<button
								type="submit"
								className="btn btn-sm join-item"
								disabled={busy || !plausible(email)}
							>
								Add
							</button>
						</div>
						{wrong && (
							<p id={HINT} className="text-error mt-2 text-xs">
								Needs to look like name@example.com.
							</p>
						)}
					</form>
					{error && (
						<p role="alert" className="text-error text-sm">
							{error}
						</p>
					)}
				</>
			)}
		</Roster>
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
			setError(reason(cause, 'that did not go through'));
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
					className="btn btn-outline btn-error btn-sm self-start gap-1.5"
					onClick={() => setArming(true)}
				>
					<Trash2 className="size-4" />
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
