import encodeQR from '@paulmillr/qr';
import { type Ref, useMemo } from 'react';

/** The quiet zone the standard asks for. */
const QUIET = 4;

/** Black on white whatever the theme does: a tinted code stops scanning. */
export default function Qr({
	text,
	className,
	ref,
}: {
	text: string;
	className?: string;
	ref?: Ref<SVGSVGElement>;
}) {
	const { path, span } = useMemo(() => {
		const matrix = encodeQR(text, 'raw');
		const squares = matrix.flatMap((row, y) =>
			row.flatMap((on, x) => (on ? [`M${x + QUIET} ${y + QUIET}h1v1h-1z`] : [])),
		);
		return { path: squares.join(''), span: matrix.length + QUIET * 2 };
	}, [text]);

	return (
		<svg
			ref={ref}
			viewBox={`0 0 ${span} ${span}`}
			className={className}
			shapeRendering="crispEdges"
			role="img"
			aria-label="QR code for the link to this room"
		>
			<rect width={span} height={span} fill="#fff" />
			<path d={path} fill="#000" />
		</svg>
	);
}

export async function toPng(svg: SVGSVGElement, size = 1024): Promise<Blob> {
	const copy = svg.cloneNode(true) as SVGSVGElement;
	copy.setAttribute('width', String(size));
	copy.setAttribute('height', String(size));
	const url = URL.createObjectURL(
		new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }),
	);
	try {
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const loading = new Image();
			loading.onload = () => resolve(loading);
			loading.onerror = () => reject(new Error('the code could not be drawn'));
			loading.src = url;
		});
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		canvas.getContext('2d')?.drawImage(image, 0, 0, size, size);
		return await new Promise((resolve, reject) =>
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('the code could not be saved'))),
				'image/png',
			),
		);
	} finally {
		URL.revokeObjectURL(url);
	}
}
