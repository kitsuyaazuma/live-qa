import { type ReactNode, useEffect, useState } from 'react';
import * as api from '../api';
import { Link } from '../router';
import { useMe } from '../use-me';
import { type StreamState, useStream } from '../use-stream';
import { Page } from './page';
import { SignIn } from './sign-in';

export function Operator({
	roomId,
	children,
}: {
	roomId: string;
	children: (room: StreamState) => ReactNode;
}) {
	const me = useMe();
	const [access, setAccess] = useState<api.RoomAccess | null | undefined>(undefined);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let stale = false;
		api.roomInfo(roomId).then(
			(info) => !stale && setAccess(info),
			(cause) =>
				!stale && setError(cause instanceof Error ? cause.message : 'could not reach the room'),
		);
		return () => {
			stale = true;
		};
	}, [roomId]);
	const room = useStream(roomId, access?.operator === true);

	if (error) {
		return (
			<Page width="max-w-sm">
				<p className="text-error py-6">{error}</p>
			</Page>
		);
	}
	if (access === undefined || me === undefined) {
		return (
			<Page width="max-w-sm">
				<span className="loading loading-spinner mx-auto my-10" />
			</Page>
		);
	}
	if (access === null) {
		return (
			<Page width="max-w-sm">
				<p className="py-6">
					There is no room called <span className="font-medium">{roomId}</span>.
				</p>
				{me?.admin && (
					<Link to="/" className="btn btn-sm self-start">
						Create one
					</Link>
				)}
			</Page>
		);
	}
	if (me === null) {
		return (
			<Page width="max-w-sm">
				<SignIn next={location.pathname} reason="Running a room takes an account." />
			</Page>
		);
	}
	if (!access.operator) {
		return (
			<Page width="max-w-sm">
				<p className="py-6">
					Signed in as <span className="font-medium">{me.account.name}</span>, who is not an
					operator of this room.
				</p>
			</Page>
		);
	}
	return <>{children(room)}</>;
}
