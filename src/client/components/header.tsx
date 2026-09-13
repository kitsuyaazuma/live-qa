import { type ReactNode, useEffect, useState } from 'react';
import { Anonymous, Moon, Sun } from '../icons';
import { Link } from '../router';
import { rememberTheme, type Theme, themePreference } from '../storage';
import { Banner } from './banner';
import { Connected, type State } from './connected';
import { GHOST } from './ghost';

const THEMES: Theme[] = ['light', 'dark'];

/** A checked theme-controller, not data-theme: setting the attribute makes
 * daisyUI paint its own light theme over the conference's colours. */
function ThemeToggle() {
	const [chosen, setChosen] = useState<Theme | null>(themePreference);
	const shown = chosen ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
	const next: Theme = shown === 'dark' ? 'light' : 'dark';

	return (
		<>
			{THEMES.map((theme) => (
				<input
					key={theme}
					type="radio"
					name="theme"
					value={theme}
					className="theme-controller hidden"
					checked={chosen === theme}
					readOnly
				/>
			))}
			<button
				type="button"
				className={`${GHOST} btn-square btn-sm`}
				aria-label={`Switch to the ${next} theme`}
				onClick={() => {
					rememberTheme(next);
					setChosen(next);
				}}
			>
				{shown === 'dark' ? <Sun /> : <Moon />}
			</button>
		</>
	);
}

export function Header({
	width,
	connection,
	children,
}: {
	width: string;
	connection?: State;
	children?: ReactNode;
}) {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		const onScroll = () => setScrolled(scrollY > 0);
		addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => removeEventListener('scroll', onScroll);
	}, []);

	return (
		<header
			className={`bg-base-100 text-base-content border-base-300 sticky top-0 z-20 border-b transition-shadow ${
				scrolled ? 'shadow-sm' : ''
			}`}
		>
			<div className={`navbar mx-auto min-h-0 gap-2 px-3 py-3 ${width}`}>
				<div className="navbar-start">
					<Link to="/" className="flex items-center">
						<Banner className="h-9 md:h-10" />
					</Link>
				</div>
				<div className="navbar-end gap-2">
					{children}
					{connection && <Connected state={connection} />}
					<ThemeToggle />
					<div className="tooltip tooltip-left" data-tip="You are anonymous here">
						<div className="avatar avatar-placeholder">
							<div className="bg-base-200 text-base-content w-8 rounded-full">
								<Anonymous className="size-4" />
								<span className="sr-only">You are anonymous here</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
