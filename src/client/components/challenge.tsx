import { useEffect, useRef } from 'react';
import { loadTurnstile } from '../turnstile';
import { Modal } from './modal';

export function Challenge({
	sitekey,
	onToken,
	onCancel,
}: {
	sitekey: string;
	onToken: (token: string) => void;
	onCancel: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		dialog.current?.showModal();
	}, []);

	useEffect(() => {
		let widget: string | undefined;
		let gone = false;
		loadTurnstile().then((turnstile) => {
			if (gone || !box.current) return;
			widget = turnstile.render(box.current, {
				sitekey,
				theme: 'auto',
				callback: onToken,
				'error-callback': onCancel,
			});
		}, onCancel);
		return () => {
			gone = true;
			if (widget) window.turnstile?.remove(widget);
		};
	}, [sitekey, onToken, onCancel]);

	return (
		<Modal ref={dialog} title="One quick check" onClose={onCancel}>
			<p className="opacity-70">Confirm you are a person before your first question or vote.</p>
			<div ref={box} className="flex min-h-16 justify-center" />
		</Modal>
	);
}
