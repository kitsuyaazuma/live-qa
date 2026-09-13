import { lazy, Suspense } from 'react';
import { usePath } from './router';
import { Landing } from './views/landing';
import { Participant } from './views/participant';

/** Kept out of the audience's bundle: they never open these. */
const Admin = lazy(() => import('./views/admin'));
const Present = lazy(() => import('./views/present'));

const ROUTE = /^\/r\/([^/]+)(?:\/(admin|present))?\/?$/;

function decoded(name: string): string | null {
	try {
		return decodeURIComponent(name);
	} catch {
		return null;
	}
}

export function App() {
	const [, name, view] = ROUTE.exec(usePath()) ?? [];
	const roomId = name ? decoded(name) : null;
	if (!roomId) return <Landing />;

	if (!view) return <Participant roomId={roomId} />;

	return (
		<Suspense
			fallback={
				<div className="flex min-h-dvh items-center justify-center">
					<span className="loading loading-spinner loading-lg" />
				</div>
			}
		>
			{view === 'admin' ? <Admin roomId={roomId} /> : <Present roomId={roomId} />}
		</Suspense>
	);
}
