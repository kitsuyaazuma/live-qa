import branding from '@branding/branding.json';
import file from '@branding/public/banner.svg?raw';

/** Drops the editor's prolog, and gives a pixel-sized file the viewBox without
 * which it would clip instead of scale. */
function scalable(source: string): string {
	const svg = source.slice(source.indexOf('<svg'));
	if (/viewBox=/.test(svg)) return svg;
	const width = /\swidth="([\d.]+)/.exec(svg)?.[1];
	const height = /\sheight="([\d.]+)/.exec(svg)?.[1];
	return width && height ? svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`) : svg;
}

const banner = scalable(file);

/** Inline, so a currentColor banner follows its surface. `fit` names the side
 * the class fixes; the other follows. */
export function Banner({
	className,
	fit = 'height',
}: {
	className: string;
	fit?: 'height' | 'width';
}) {
	const sizing =
		fit === 'height' ? '[&>svg]:h-full [&>svg]:w-auto' : '[&>svg]:w-full [&>svg]:h-auto';
	return (
		<span
			role="img"
			aria-label={branding.title}
			className={`inline-block ${sizing} ${className}`}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: a file from the repository, read at build time
			dangerouslySetInnerHTML={{ __html: banner }}
		/>
	);
}
