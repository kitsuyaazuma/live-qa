import type { ReactNode, Ref } from 'react';

export function Modal({
	ref,
	title,
	className,
	onClose,
	children,
}: {
	ref: Ref<HTMLDialogElement>;
	title: string;
	className?: string;
	onClose?: () => void;
	children: ReactNode;
}) {
	return (
		<dialog ref={ref} className={`modal ${className ?? ''}`} onClose={onClose}>
			<div className="modal-box flex max-h-[calc(100dvh-6rem)] flex-col gap-5">
				<h2 className="text-lg font-semibold">{title}</h2>
				{children}
			</div>
			<form method="dialog" className="modal-backdrop">
				<button type="submit">close</button>
			</form>
		</dialog>
	);
}
