import type { Connection } from '../use-room';
import type { StreamConnection } from '../use-stream';

export type State = Connection | StreamConnection;

/** Normal is silent: a green dot that is always there tells nobody anything. */
const TROUBLE: Partial<Record<State, { dot: string; said: string }>> = {
	stale: { dot: 'status-warning', said: 'Reconnecting' },
	denied: { dot: 'status-error', said: 'Not allowed' },
	crowded: { dot: 'status-error', said: 'Too many screens' },
};

export function Connected({ state }: { state: State }) {
	const trouble = TROUBLE[state];
	if (!trouble) return null;
	return (
		<span role="status" className="inline-flex items-center gap-1.5 text-xs">
			<span className={`status ${trouble.dot}`} />
			{trouble.said}
		</span>
	);
}
