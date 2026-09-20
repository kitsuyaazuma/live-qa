import type { ReactNode } from 'react';
import type { Provider } from '../../protocol';
import { GitHubMark, GoogleMark } from '../icons';
import { useProviders } from '../use-providers';

/** Each provider's button in its own colours, which is how people recognise
 * them; the rest of the page's theme does not reach in here. */
const BUTTONS: Record<Provider, { label: string; className: string; mark: ReactNode }> = {
	google: {
		label: 'Continue with Google',
		className: 'border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f2f2f2]',
		mark: <GoogleMark />,
	},
	github: {
		label: 'Continue with GitHub',
		className: 'border-[#24292f] bg-[#24292f] text-white hover:bg-[#32383f]',
		mark: <GitHubMark />,
	},
};

export function SignIn({ next, reason }: { next: string; reason?: string }) {
	const providers = useProviders();
	const back = encodeURIComponent(next);
	return (
		<div className="flex flex-col gap-3">
			{reason && <p className="opacity-70">{reason}</p>}
			{providers?.length === 0 && <p className="opacity-70">Signing in is not set up here.</p>}
			{providers?.map((provider) => (
				<a
					key={provider}
					className={`btn justify-start gap-3 ${BUTTONS[provider].className}`}
					href={`/auth/${provider}?next=${back}`}
				>
					{BUTTONS[provider].mark}
					{BUTTONS[provider].label}
				</a>
			))}
		</div>
	);
}
