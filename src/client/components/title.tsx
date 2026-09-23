import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** A setting's name with its icon, and one line on what it does. */
export function Title({
	icon: Icon,
	text,
	said,
	children,
}: {
	icon: LucideIcon;
	text: string;
	said: string;
	/** Drawn at the end of the name's line, for a count or a disclosure arrow. */
	children?: ReactNode;
}) {
	return (
		<>
			<span className="flex items-center gap-2">
				<Icon className="size-4" />
				{text}
				{children}
			</span>
			<span className="block text-xs opacity-70">{said}</span>
		</>
	);
}
