import type { ReactNode } from 'react';
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
	const room = useStream(roomId, me?.admin === true);

	if (me === undefined) {
		return (
			<Page width="max-w-sm">
				<span className="loading loading-spinner mx-auto my-10" />
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
	if (!me.admin) {
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
