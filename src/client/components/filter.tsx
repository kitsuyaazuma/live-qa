import { useRef, useState } from 'react';
import type { Question } from '../../protocol';
import { Funnel } from '../icons';
import { Modal } from './modal';

type Progress = 'open' | 'answered';
type Asker = 'you' | 'others';

const PROGRESS: Record<Progress, string> = { open: 'Not yet answered', answered: 'Answered' };
const ASKER: Record<Asker, string> = { you: 'You', others: 'Others' };

function toggled<T>(chosen: Set<T>, value: T): Set<T> {
	const next = new Set(chosen);
	if (!next.delete(value)) next.add(value);
	return next;
}

/** Or within a facet, and across them; a facet with nothing checked does not narrow. */
export function useFilter(asked: Set<string>) {
	const [progress, setProgress] = useState<Set<Progress>>(() => new Set(['open']));
	const [asker, setAsker] = useState<Set<Asker>>(() => new Set());

	const passes = (question: Question) =>
		(progress.size === 0 || progress.has(question.status === 'answered' ? 'answered' : 'open')) &&
		(asker.size === 0 || asker.has(asked.has(question.id) ? 'you' : 'others'));
	const narrowed = progress.size !== 1 || !progress.has('open') || asker.size > 0;

	return { passes, narrowed, progress, setProgress, asker, setAsker };
}

export function Filter({ filter, asked }: { filter: ReturnType<typeof useFilter>; asked: number }) {
	const dialog = useRef<HTMLDialogElement>(null);

	return (
		<>
			<div className="indicator">
				{filter.narrowed && <span className="indicator-item status status-secondary" />}
				<button
					type="button"
					className="btn btn-ghost btn-square btn-sm"
					aria-label="Filter"
					onClick={() => dialog.current?.showModal()}
				>
					<Funnel />
				</button>
			</div>
			<Modal ref={dialog} title="Filter" className="modal-bottom sm:modal-middle">
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-2 text-xs tracking-wide uppercase opacity-70">Progress</legend>
					{(Object.keys(PROGRESS) as Progress[]).map((value) => (
						<label key={value} className="flex cursor-pointer items-center gap-3">
							<input
								type="checkbox"
								className="checkbox checkbox-sm"
								checked={filter.progress.has(value)}
								onChange={() => filter.setProgress(toggled(filter.progress, value))}
							/>
							{PROGRESS[value]}
						</label>
					))}
				</fieldset>
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-2 text-xs tracking-wide uppercase opacity-70">Asked by</legend>
					{(Object.keys(ASKER) as Asker[]).map((value) => (
						<label key={value} className="flex cursor-pointer items-center gap-3">
							<input
								type="checkbox"
								className="checkbox checkbox-sm"
								checked={filter.asker.has(value)}
								disabled={value === 'you' && asked === 0}
								onChange={() => filter.setAsker(toggled(filter.asker, value))}
							/>
							{ASKER[value]}
							{value === 'you' && asked === 0 && (
								<span className="text-xs opacity-70">You have not asked one yet.</span>
							)}
						</label>
					))}
				</fieldset>
			</Modal>
		</>
	);
}
