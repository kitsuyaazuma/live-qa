import type { ReactNode } from 'react';
import type { State } from './connected';
import { Credit } from './credit';
import { Header } from './header';

export function Page({
	width,
	connection,
	children,
}: {
	width: string;
	connection?: State;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-dvh flex-col">
			<Header width={width} connection={connection} />
			<div className={`mx-auto flex w-full grow flex-col gap-4 p-3 sm:p-4 ${width}`}>
				{children}
			</div>
			<Credit />
		</div>
	);
}
