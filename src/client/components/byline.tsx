import type { Asker } from '../../protocol';

/** Who asked, when they chose to say. */
export function Byline({ asker, big = false }: { asker: Asker; big?: boolean }) {
	return (
		<div
			className={`mb-1 flex min-w-0 items-center gap-1.5 ${big ? 'text-base' : 'text-xs'} opacity-80`}
		>
			<div className={`avatar ${asker.avatar ? '' : 'avatar-placeholder'}`}>
				<div className={`bg-base-200 text-base-content rounded-full ${big ? 'w-7' : 'w-5'}`}>
					{asker.avatar ? (
						<img src={asker.avatar} alt="" referrerPolicy="no-referrer" />
					) : (
						<span className={big ? 'text-sm' : 'text-[10px]'}>{asker.name.slice(0, 1)}</span>
					)}
				</div>
			</div>
			<span className="truncate">{asker.name}</span>
		</div>
	);
}
