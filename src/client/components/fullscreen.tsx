import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useState } from 'react';

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
			{full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
		</button>
	);
}
