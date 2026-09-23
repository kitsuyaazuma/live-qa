import { ChevronDown, type LucideIcon, ShieldUser, Trash2, Users } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { EMAIL_MAX, EMAIL_PATTERN, isScratch, type Operator, requireEmail } from '../../protocol';
import * as api from '../api';
import { navigate } from '../router';
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

/** Shut until asked for: the stage opens these settings on a screen in the hall,
 * and nothing asks the worker for a roster until someone looks. */
function Roster({
	icon,
	text,
	said,
	count,
	onOpen,
	children,
}: {
	icon: LucideIcon;
	text: string;
	said: string;
	count: number | null;
	onOpen: () => void;
	children: ReactNode;
}) {
	return (
		<details className="group" onToggle={(event) => event.currentTarget.open && onOpen()}>
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
	const [list, setList] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	function load() {
		if (list || error) return;
		void api.admins().then(setList, (cause) => setError(reason(cause, 'could not load')));
	}

	return (
		<Roster
			icon={ShieldUser}
			text="Admins"
			said="Set where the app is deployed. They can run every room."
			count={list?.length ?? null}
			onOpen={load}
		>
			{list === null && !error && <span className="loading loading-spinner loading-sm" />}
			{list && (
				<ul className={ROWS}>
					{list.map((email) => (
						<li key={email} className="truncate px-3 py-1.5">
							{email}
						</li>
					))}
				</ul>
			)}
			{error && (
				<p role="alert" className="text-error text-sm">
					{error}
				</p>
			)}
		</Roster>
	);
}

export function Operators({ roomId }: { roomId: string }) {
	const [list, setList] = useState<Operator[] | null>(null);
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scratch = isScratch(roomId);

	function load() {
		if (scratch || list || error) return;
		void api.operators(roomId).then(setList, (cause) => setError(reason(cause, 'could not load')));
	}

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
			onOpen={load}
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
						{/* `validator` on the wrapper reveals the hint off a sibling, which a join
						    item cannot be; the field takes the error colour without the green. */}
						<div className="join validator w-full">
							<input
								type="email"
								pattern={EMAIL_PATTERN}
								maxLength={EMAIL_MAX}
								className="input input-sm join-item user-invalid:input-error w-full"
								placeholder="name@example.com"
								aria-label="Operator email"
								aria-describedby={HINT}
								value={email}
								onChange={(event) => setEmail(event.target.value)}
							/>
							<button
								type="submit"
								className="btn btn-sm join-item"
								disabled={busy || !plausible(email)}
							>
								Add
							</button>
						</div>
						<p id={HINT} className="validator-hint hidden">
							Needs to look like name@example.com.
						</p>
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
