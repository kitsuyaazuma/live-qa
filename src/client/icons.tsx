import type { SVGProps } from 'react';

/** A dozen strokes are not worth a dependency; each follows the text colour. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className="size-5"
			{...props}
		>
			{children}
		</svg>
	);
}

export function ThumbsUp(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
			<path d="M7 11l4.5-7.5a2 2 0 0 1 3.5 1.3V9h4a2 2 0 0 1 2 2.3l-1.2 6.9A2 2 0 0 1 17.8 20H7" />
		</Icon>
	);
}

export function Pin(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M12 17v5" />
			<path d="M9 3h6l-1 6 3 3H7l3-3z" />
		</Icon>
	);
}

export function PinOff(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M12 17v5" />
			<path d="M9 3h6l-1 6 3 3H7l3-3z" />
			<path d="M4 4l16 16" />
		</Icon>
	);
}

export function Check(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M4 12.5l5 5L20 6.5" />
		</Icon>
	);
}

export function Undo(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
			<path d="M3 3v5h5" />
		</Icon>
	);
}

export function Eye(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
			<circle cx="12" cy="12" r="3" />
		</Icon>
	);
}

export function EyeOff(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M3 3l18 18" />
			<path d="M10.6 6a10 10 0 0 1 1.4-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.3" />
			<path d="M6.3 6.8A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 4.7-1.3" />
		</Icon>
	);
}

export function Expand(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
		</Icon>
	);
}

export function Shrink(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
		</Icon>
	);
}

export function Gear(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M19.6 12 22 14.2l-.6 1.7-3.2.5-.8 1-.1 3.2-1.6.8-2.6-1.9H12L9.8 22l-1.7-.6-.5-3.2-1-.8-3.2.1-.8-1.6 1.9-2.6-.1-1.3L2 9.8l.6-1.7 3.2-.5.8-1-.1-3.2 1.6-.8 2.6 1.9H12L14.2 2l1.7.6.5 3.2 1 .8 3.2-.1.8 1.6-1.9 2.6Z" />
			<circle cx="12" cy="12" r="3" />
		</Icon>
	);
}

export function Share(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<circle cx="18" cy="5" r="3" />
			<circle cx="6" cy="12" r="3" />
			<circle cx="18" cy="19" r="3" />
			<path d="M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2" />
		</Icon>
	);
}

export function Presentation(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M12 16v4M8 20h8" />
		</Icon>
	);
}

export function Funnel(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M3 5h18l-7 8v6l-4 2v-8z" />
		</Icon>
	);
}

export function Anonymous(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M3 11h18" />
			<path d="M6.5 11l1.7-5.4A1 1 0 0 1 9.2 5h5.6a1 1 0 0 1 1 .6L17.5 11" />
			<circle cx="8" cy="16.5" r="2.5" />
			<circle cx="16" cy="16.5" r="2.5" />
			<path d="M10.5 16h3" />
		</Icon>
	);
}

export function ArrowLeft(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M19 12H5M12 5l-7 7 7 7" />
		</Icon>
	);
}

export function People(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<circle cx="9" cy="8" r="3.5" />
			<path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
			<path d="M16 5a3.5 3.5 0 0 1 0 7" />
			<path d="M18 13.5a6.5 6.5 0 0 1 3.5 6.5" />
		</Icon>
	);
}

export function Send(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M22 2L11 13" />
			<path d="M22 2l-7 20-4-9-9-4z" />
		</Icon>
	);
}

/** Google's G in its own colours. */
export function GoogleMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 48 48" aria-hidden="true" className="size-5" {...props}>
			<path
				fill="#EA4335"
				d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
			/>
			<path
				fill="#4285F4"
				d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
			/>
			<path
				fill="#FBBC05"
				d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
			/>
			<path
				fill="#34A853"
				d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
			/>
		</svg>
	);
}

/** GitHub's mark, from octicons. */
export function GitHubMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true" className="size-5" fill="currentColor" {...props}>
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
		</svg>
	);
}

export function ArrowUp(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M12 19V5M5 12l7-7 7 7" />
		</Icon>
	);
}

export function Copy(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<rect x="9" y="9" width="11" height="11" rx="2" />
			<path d="M5 15V6a2 2 0 0 1 2-2h9" />
		</Icon>
	);
}

export function Download(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M12 4v11M8 11l4 4 4-4" />
			<path d="M5 19h14" />
		</Icon>
	);
}

export function Sun(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		</Icon>
	);
}

export function Moon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
		</Icon>
	);
}

export function External(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M14 4h6v6M20 4l-9 9" />
			<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
		</Icon>
	);
}
