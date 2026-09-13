import { type ReactNode, useEffect, useState } from 'react';

export function navigate(to: string): void {
	history.pushState(null, '', to);
	dispatchEvent(new PopStateEvent('popstate'));
}

export function usePath(): string {
	const [path, setPath] = useState(() => location.pathname);
	useEffect(() => {
		const onPop = () => setPath(location.pathname);
		addEventListener('popstate', onPop);
		return () => removeEventListener('popstate', onPop);
	}, []);
	return path;
}

/** A real href, so the link can be opened in a new tab or shared. */
export function Link({
	to,
	className,
	children,
}: {
	to: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<a
			href={to}
			className={className}
			onClick={(event) => {
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
				event.preventDefault();
				navigate(to);
			}}
		>
			{children}
		</a>
	);
}
