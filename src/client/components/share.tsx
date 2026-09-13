import { lazy, Suspense, useRef, useState } from 'react';
import { Copy, Download, Share as ShareIcon } from '../icons';
import { Modal } from './modal';

const Qr = lazy(() => import('./qr'));

export function Share({ roomId }: { roomId: string }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const code = useRef<SVGSVGElement>(null);
	const [said, setSaid] = useState<string | null>(null);
	const link = `${location.origin}/r/${roomId}`;

	function say(message: string) {
		setSaid(message);
		setTimeout(() => setSaid(null), 1500);
	}

	async function copyLink() {
		await navigator.clipboard.writeText(link);
		say('Link copied');
	}

	async function copyCode() {
		if (!code.current) return;
		const { toPng } = await import('./qr');
		const png = await toPng(code.current);
		await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
		say('QR code copied');
	}

	async function downloadCode() {
		if (!code.current) return;
		const { toPng } = await import('./qr');
		const url = URL.createObjectURL(await toPng(code.current));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `live-qa-${roomId}.png`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	return (
		<>
			<button type="button" className="btn gap-2" onClick={() => dialog.current?.showModal()}>
				<ShareIcon />
				Share
			</button>
			<Modal ref={dialog} title="Share this room">
				<div className="flex flex-col items-center gap-4">
					<Suspense fallback={<div className="skeleton size-56" />}>
						<Qr ref={code} text={link} className="rounded-box size-56" />
					</Suspense>
					<code className="text-sm break-all">{link}</code>
					<div className="join">
						<button type="button" className="btn join-item gap-1.5" onClick={() => void copyLink()}>
							<Copy className="size-4" />
							Link
						</button>
						<button type="button" className="btn join-item gap-1.5" onClick={() => void copyCode()}>
							<Copy className="size-4" />
							QR
						</button>
						<button
							type="button"
							className="btn join-item gap-1.5"
							onClick={() => void downloadCode()}
						>
							<Download className="size-4" />
							PNG
						</button>
					</div>
					<p role="status" className="h-4 text-xs opacity-70">
						{said ?? ''}
					</p>
				</div>
			</Modal>
		</>
	);
}
