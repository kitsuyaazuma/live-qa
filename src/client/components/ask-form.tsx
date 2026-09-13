import { useState } from 'react';
import { TEXT_MAX } from '../../protocol';
import { Anonymous, Send } from '../icons';

/** Shown from four fifths of the limit: a counter on an empty box is nagging. */
const COUNTER_FROM = TEXT_MAX * 0.8;

export function AskForm({
	moderated,
	onAsk,
}: {
	moderated: boolean;
	onAsk: (text: string) => Promise<boolean>;
}) {
	const [text, setText] = useState('');
	const [busy, setBusy] = useState(false);
	const length = text.trim().length;
	const refusable = busy || length === 0 || length > TEXT_MAX;

	async function submit(event: { preventDefault: () => void }) {
		event.preventDefault();
		if (refusable) return;
		setBusy(true);
		const sent = await onAsk(text.trim());
		setBusy(false);
		if (sent) setText('');
	}

	return (
		<form onSubmit={submit}>
			<div className="relative">
				<textarea
					className={`textarea w-full resize-none pb-12 ${length > TEXT_MAX ? 'textarea-error' : ''}`}
					rows={3}
					placeholder="Ask a question"
					aria-label="Your question"
					aria-describedby={moderated ? 'ask-hint' : undefined}
					value={text}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit(event);
					}}
				/>
				<div className="absolute bottom-2 left-3 flex h-8 items-center gap-1.5 text-xs opacity-70">
					<Anonymous className="size-4" />
					Anonymous
				</div>
				<div className="absolute right-2 bottom-2 flex items-center gap-2">
					{length > COUNTER_FROM && (
						<span
							className={`text-xs tabular-nums ${length > TEXT_MAX ? 'text-error' : 'opacity-70'}`}
						>
							{length}/{TEXT_MAX}
						</span>
					)}
					<button type="submit" className="btn btn-primary btn-sm gap-1.5" disabled={refusable}>
						{busy ? (
							<span className="loading loading-spinner loading-xs" />
						) : (
							<Send className="size-4" />
						)}
						Send
					</button>
				</div>
			</div>
			{moderated && (
				<p id="ask-hint" className="mt-1 px-1 text-xs opacity-70">
					Questions appear once reviewed.
				</p>
			)}
		</form>
	);
}
