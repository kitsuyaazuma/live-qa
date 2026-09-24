import { Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as api from '../api';
import { Link } from '../router';
import { useMe } from '../use-me';

/** Asks about the room only for a signed-in account that is not an admin, so
 * the anonymous audience sends nothing extra. */
export function AdminLink({ roomId }: { roomId: string }) {
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
	return (
		<Link to={`/r/${roomId}/admin`} className="btn btn-sm gap-1.5">
			<Settings2 className="size-4" />
			Admin
		</Link>
	);
}
