import { ExternalLink } from 'lucide-react';

const SOURCE = 'github.com/kitsuyaazuma/live-qa';

export function Credit() {
	return (
		<footer className="footer footer-center bg-base-200 text-base-content p-4 text-xs">
			<aside className="flex flex-row items-center gap-1">
				Powered by
				<a
					href={`https://${SOURCE}`}
					className="link link-hover inline-flex items-center gap-1"
					target="_blank"
					rel="noreferrer"
				>
					{SOURCE}
					<ExternalLink className="size-3.5" />
				</a>
			</aside>
		</footer>
	);
}
