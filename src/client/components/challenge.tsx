import { useEffect, useRef, useState } from 'react';
import { loadTurnstile } from '../turnstile';

/** Invisible unless Cloudflare wants the person to do something; only then is there anything to explain. */
export function Challenge({
	sitekey,
	onToken,
	onCancel,
}: {
	sitekey: string;
	onToken: (token: string) => void;
	onCancel: () => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const [interactive, setInteractive] = useState(false);

	useEffect(() => {
		let widget: string | undefined;
		let gone = false;
		loadTurnstile().then((turnstile) => {
			if (gone || !box.current) return;
			widget = turnstile.render(box.current, {
				sitekey,
				theme: 'auto',
				appearance: 'interaction-only',
				callback: onToken,
				'error-callback': onCancel,
				'before-interactive-callback': () => setInteractive(true),
			});
		}, onCancel);
		return () => {
			gone = true;
			if (widget) window.turnstile?.remove(widget);
		};
	}, [sitekey, onToken, onCancel]);

	return (
		<div className={interactive ? 'flex flex-col items-center gap-1 py-2' : ''}>
			{interactive && <p className="text-xs opacity-70">A quick check, once per device.</p>}
			<div ref={box} />
		</div>
	);
}
