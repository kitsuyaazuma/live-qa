import { useEffect, useState } from 'react';
import type { Me } from '../protocol';
import * as api from './api';

/** One answer per page load, shared by every part that asks. */
let pending: Promise<Me | null> | undefined;

/** Undefined until the answer is in. */
export function useMe(): Me | null | undefined {
	const [me, setMe] = useState<Me | null | undefined>(undefined);
	useEffect(() => {
		pending ??= api.me().catch(() => null);
		void pending.then(setMe);
	}, []);
	return me;
}
