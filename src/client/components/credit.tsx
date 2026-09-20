import { version } from '../../../package.json';

const SOURCE = 'github.com/kitsuyaazuma/live-qa';

export function Credit() {
	return (
		<footer className="footer footer-center bg-base-200 text-base-content p-4 text-xs">
			<aside className="flex flex-row items-center gap-1">
				Powered by
				<a href={`https://${SOURCE}`} className="link link-hover" target="_blank" rel="noreferrer">
					{SOURCE}
				</a>
				<a
					href={`https://${SOURCE}/releases/tag/v${version}`}
					className="link link-hover"
					target="_blank"
					rel="noreferrer"
				>
					v{version}
				</a>
			</aside>
		</footer>
	);
}
