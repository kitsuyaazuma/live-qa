import { useEffect, useState } from 'react';
import type { Me } from '../protocol';
import * as api from './api';

/** One answer per page load, shared by every part that asks; a profile edit
 * reaches them all through here. */
let current: Me | null | undefined;
let asked = false;
const listeners = new Set<(me: Me | null) => void>();

export function updateMe(me: Me | null): void {
	current = me;
	for (const listener of listeners) listener(me);
}

/** Undefined until the answer is in. */
export function useMe(): Me | null | undefined {
	const [me, setMe] = useState(current);
	useEffect(() => {
		listeners.add(setMe);
		if (!asked) {
			asked = true;
			void api.me().then(updateMe, () => updateMe(null));
		}
		return () => {
			listeners.delete(setMe);
		};
	}, []);
	return me;
}
