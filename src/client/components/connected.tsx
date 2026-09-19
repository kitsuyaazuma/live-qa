import { Ban, type LucideIcon, Users, WifiOff } from 'lucide-react';
import type { Connection } from '../use-room';
import type { StreamConnection } from '../use-stream';

export type State = Connection | StreamConnection;

/** Normal is silent: a green dot that is always there tells nobody anything. */
const TROUBLE: Partial<Record<State, { tone: string; icon: LucideIcon; said: string }>> = {
	stale: { tone: 'text-warning', icon: WifiOff, said: 'Reconnecting' },
	denied: { tone: 'text-error', icon: Ban, said: 'Not allowed' },
	crowded: { tone: 'text-error', icon: Users, said: 'Too many screens' },
};

export function Connected({ state }: { state: State }) {
	const trouble = TROUBLE[state];
	if (!trouble) return null;
	return (
		<span role="status" className={`inline-flex items-center gap-1.5 text-xs ${trouble.tone}`}>
			<trouble.icon className="size-4" />
			{trouble.said}
		</span>
	);
}
