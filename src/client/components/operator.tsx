import { type ReactNode, useState } from 'react';
import { operatorToken, rememberOperatorToken } from '../storage';
import { type StreamState, useStream } from '../use-stream';
import { TokenGate } from './token-gate';

export function Operator({
	roomId,
	children,
}: {
	roomId: string;
	children: (room: StreamState, token: string) => ReactNode;
}) {
	const [token, setToken] = useState(operatorToken);
	const room = useStream(roomId, token);

	if (!token || room.connection === 'denied') {
		return (
			<TokenGate
				rejected={room.connection === 'denied'}
				onToken={(value) => {
					rememberOperatorToken(value);
					setToken(value);
				}}
			/>
		);
	}
	return <>{children(room, token)}</>;
}
