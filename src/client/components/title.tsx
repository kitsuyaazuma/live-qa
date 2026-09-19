import type { LucideIcon } from 'lucide-react';

/** A setting's name with its icon, and one line on what it does. */
export function Title({
	icon: Icon,
	text,
	said,
}: {
	icon: LucideIcon;
	text: string;
	said: string;
}) {
	return (
		<>
			<span className="flex items-center gap-2">
				<Icon className="size-4" />
				{text}
			</span>
			<span className="block text-xs opacity-70">{said}</span>
		</>
	);
}
