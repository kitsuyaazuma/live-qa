import { useEffect, useState } from 'react';
import type { Provider } from '../protocol';
import * as api from './api';

/** One answer per page load, shared by every sign-in panel. */
let current: Provider[] | undefined;
let asked = false;
const listeners = new Set<(providers: Provider[]) => void>();

/** Undefined until the answer is in; an unreachable worker offers nothing. */
export function useProviders(): Provider[] | undefined {
	const [providers, setProviders] = useState(current);
	useEffect(() => {
		listeners.add(setProviders);
		if (!asked) {
			asked = true;
			void api.providers().then(
				(offered) => {
					current = offered;
					for (const listener of listeners) listener(offered);
				},
				() => {
					current = [];
					for (const listener of listeners) listener([]);
				},
			);
		}
		return () => {
			listeners.delete(setProviders);
		};
	}, []);
	return providers;
}
