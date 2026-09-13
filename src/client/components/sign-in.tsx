import { GitHubMark, GoogleMark } from '../icons';

/** Each provider's button in its own colours, which is how people recognise
 * them; the rest of the page's theme does not reach in here. */
export function SignIn({ next, reason }: { next: string; reason?: string }) {
	const back = encodeURIComponent(next);
	return (
		<div className="flex flex-col gap-3">
			{reason && <p className="opacity-70">{reason}</p>}
			<a
				className="btn justify-start gap-3 border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f2f2f2]"
				href={`/auth/google?next=${back}`}
			>
				<GoogleMark />
				Continue with Google
			</a>
			<a
				className="btn justify-start gap-3 border-[#24292f] bg-[#24292f] text-white hover:bg-[#32383f]"
				href={`/auth/github?next=${back}`}
			>
				<GitHubMark />
				Continue with GitHub
			</a>
		</div>
	);
}
