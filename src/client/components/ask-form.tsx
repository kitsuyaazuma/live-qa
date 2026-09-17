import { useState } from 'react';
import { TEXT_MAX } from '../../protocol';
import { Anonymous, Send } from '../icons';
import { useMe } from '../use-me';

/** Shown from four fifths of the limit: a counter on an empty box is nagging. */
const COUNTER_FROM = TEXT_MAX * 0.8;

export function AskForm({
	moderated,
	onAsk,
}: {
	moderated: boolean;
	onAsk: (text: string, named: boolean) => Promise<boolean>;
}) {
	const me = useMe();
	const [text, setText] = useState('');
	const [anonymous, setAnonymous] = useState(false);
	const named = !!me && !anonymous;
	const [busy, setBusy] = useState(false);
	const length = text.trim().length;
	const refusable = busy || length === 0 || length > TEXT_MAX;

	async function submit(event: { preventDefault: () => void }) {
		event.preventDefault();
		if (refusable) return;
		setBusy(true);
		const sent = await onAsk(text.trim(), named);
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
				{me ? (
					<fieldset aria-label="Ask as" className="join absolute bottom-2 left-2 h-8 items-center">
						<button
							type="button"
							className={`btn btn-xs join-item gap-1.5 font-normal ${named ? 'btn-neutral' : ''}`}
							aria-pressed={named}
							title="Ask with your name"
							onClick={() => setAnonymous(false)}
						>
							<div className={`avatar ${me.account.avatar ? '' : 'avatar-placeholder'}`}>
								<div className="bg-base-200 text-base-content w-4 rounded-full">
									{me.account.avatar ? (
										<img src={me.account.avatar} alt="" referrerPolicy="no-referrer" />
									) : (
										<span className="text-[9px]">{me.account.name.slice(0, 1)}</span>
									)}
								</div>
							</div>
							<span className="max-w-28 truncate">{me.account.name}</span>
						</button>
						<button
							type="button"
							className={`btn btn-xs join-item gap-1.5 font-normal ${named ? '' : 'btn-neutral'}`}
							aria-pressed={!named}
							title="Ask anonymously"
							onClick={() => setAnonymous(true)}
						>
							<Anonymous className="size-4" />
							Anonymous
						</button>
					</fieldset>
				) : (
					<div className="absolute bottom-2 left-3 flex h-8 items-center gap-1.5 text-xs opacity-70">
						<Anonymous className="size-4" />
						Anonymous
					</div>
				)}
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
