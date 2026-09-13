import { useEffect, useState } from 'react';
import { Expand, Shrink } from '../icons';

export function Fullscreen({ className }: { className?: string }) {
	const [full, setFull] = useState(() => document.fullscreenElement !== null);

	useEffect(() => {
		const onChange = () => setFull(document.fullscreenElement !== null);
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	}, []);

	return (
		<button
			type="button"
			className={`btn btn-ghost btn-square ${className ?? ''}`}
			aria-label={full ? 'Leave full screen' : 'Full screen'}
			onClick={() =>
				void (
					full ? document.exitFullscreen() : document.documentElement.requestFullscreen()
				).catch(() => {})
			}
		>
			{full ? <Shrink /> : <Expand />}
		</button>
	);
}
