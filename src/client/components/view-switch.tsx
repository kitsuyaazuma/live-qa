import { type LucideIcon, UserCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as api from '../api';
import { Link } from '../router';
import { useMe } from '../use-me';

type View = 'audience' | 'admin';

const VIEWS: Record<View, { label: string; icon: LucideIcon; path: string }> = {
	audience: { label: 'Audience', icon: Users, path: '' },
	admin: { label: 'Admin', icon: UserCog, path: '/admin' },
};

/** Both views lit side by side, so where you are and where the other press
 * goes read at a glance. */
export function ViewSwitch({ roomId, current }: { roomId: string; current: View }) {
	return (
		<nav aria-label="View" className="join">
			{(Object.keys(VIEWS) as View[]).map((view) => {
				const { label, icon: Icon, path } = VIEWS[view];
				const face = (
					<>
						<Icon className="size-4" />
						<span className="max-sm:sr-only">{label}</span>
					</>
				);
				return view === current ? (
					<span
						key={view}
						aria-current="page"
						className="btn btn-sm btn-neutral join-item pointer-events-none gap-1.5"
					>
						{face}
					</span>
				) : (
					<Link key={view} to={`/r/${roomId}${path}`} className="btn btn-sm join-item gap-1.5">
						{face}
					</Link>
				);
			})}
		</nav>
	);
}

/** Asks about the room only for a signed-in account that is not an admin, so
 * the anonymous audience sends nothing extra. */
export function AudienceSwitch({ roomId }: { roomId: string }) {
	const me = useMe();
	const [operator, setOperator] = useState(false);
	const asks = me != null && !me.admin;
	useEffect(() => {
		if (!asks) return;
		let stale = false;
		api.roomInfo(roomId).then(
			(info) => !stale && setOperator(info?.operator === true),
			() => {},
		);
		return () => {
			stale = true;
		};
	}, [roomId, asks]);

	if (!me?.admin && !operator) return null;
	return <ViewSwitch roomId={roomId} current="audience" />;
}
