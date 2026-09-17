import { useEffect, useState } from 'react';
import type { Me, RoomInfo } from '../../protocol';
import * as api from '../api';
import { Link, navigate } from '../router';
import { slug } from '../slug';
import { ago, useNow } from '../time';

export function Host({ me }: { me: Me }) {
	const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const id = slug(name);

	useEffect(() => {
		void api.listRooms().then(setRooms, () => setRooms([]));
	}, []);

	async function create(event: { preventDefault: () => void }) {
		event.preventDefault();
		if (!id || busy) return;
		setBusy(true);
		setError(null);
		try {
			const room = await api.createRoom(id);
			navigate(`/r/${room.id}/admin`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'could not create the room');
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			{me.admin ? (
				<form onSubmit={create}>
					<fieldset className="fieldset bg-base-100 border-base-content/25 rounded-box min-w-0 border p-4">
						<legend className="fieldset-legend">Create a room</legend>
						<input
							className="input w-full"
							placeholder="Room name, such as keynote"
							value={name}
							autoCapitalize="none"
							autoComplete="off"
							aria-label="Room name"
							aria-describedby="room-hint"
							// biome-ignore lint/a11y/noAutofocus: the field appears because a choice was just made
							autoFocus
							onChange={(event) => setName(event.target.value)}
						/>
						<p id="room-hint" className="label text-xs whitespace-normal">
							{id
								? `The room will live at /r/${id}, which is what the QR code carries.`
								: 'Letters and numbers. This becomes the link and the QR code.'}
						</p>
						{error && (
							<p role="alert" className="text-error text-sm">
								{error}
							</p>
						)}
						<button
							type="submit"
							className="btn btn-primary mt-2 self-start"
							disabled={!id || busy}
						>
							Create
						</button>
					</fieldset>
				</form>
			) : (
				<p className="text-sm opacity-70">
					Only an admin creates rooms. The ones you may run appear here once an admin adds your
					email to them.
				</p>
			)}
			<RoomList rooms={rooms} />
		</div>
	);
}

function RoomList({ rooms }: { rooms: RoomInfo[] | null }) {
	const now = useNow();
	if (rooms === null) return <span className="loading loading-spinner mx-auto" />;
	if (rooms.length === 0) return <p className="text-sm opacity-70">No rooms yet.</p>;
	return (
		<ul className="list bg-base-100 border-base-content/25 rounded-box border">
			<li className="p-4 pb-2 text-xs tracking-wide opacity-60">Your rooms</li>
			{rooms.map((room) => (
				<li key={room.id} className="list-row items-center">
					<div className="min-w-0">
						<div className="truncate font-medium">{room.id}</div>
						{room.createdAt !== null && (
							<div className="text-xs opacity-70">created {ago(room.createdAt, now)}</div>
						)}
					</div>
					<Link to={`/r/${room.id}/admin`} className="btn btn-sm">
						Admin
					</Link>
					<Link to={`/r/${room.id}`} className="btn btn-ghost btn-sm">
						Join
					</Link>
				</li>
			))}
		</ul>
	);
}
