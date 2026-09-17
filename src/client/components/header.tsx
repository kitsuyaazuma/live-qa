import { type ReactNode, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import { Anonymous, Moon, Sun } from '../icons';
import { Link } from '../router';
import { rememberTheme, type Theme, themePreference } from '../storage';
import { useMe } from '../use-me';
import { Banner } from './banner';
import { Connected, type State } from './connected';
import { GHOST } from './ghost';
import { Profile } from './profile';
import { SignIn } from './sign-in';

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

/** daisyUI's focus dropdown: open while the trigger or the panel has focus, so
 * a click anywhere else closes it. */
function Dropdown({
	label,
	trigger,
	panel,
	children,
}: {
	label: string;
	trigger: ReactNode;
	panel: string;
	children: ReactNode;
}) {
	return (
		<div className="dropdown dropdown-end">
			{/* biome-ignore lint/a11y/useSemanticElements: Safari does not focus a button on click */}
			<div
				tabIndex={0}
				role="button"
				className="btn btn-ghost btn-circle btn-sm p-0"
				aria-label={label}
			>
				{trigger}
			</div>
			<div
				// biome-ignore lint/a11y/noNoninteractiveTabindex: focus inside the panel is what holds it open
				tabIndex={0}
				className={`dropdown-content bg-base-100 border-base-300 rounded-box z-30 mt-2 border shadow ${panel}`}
			>
				{children}
			</div>
		</div>
	);
}

function Account() {
	const me = useMe();
	const profile = useRef<HTMLDialogElement>(null);

	if (!me) {
		return (
			<Dropdown
				label="You are anonymous. Sign in"
				panel="w-72 p-4"
				trigger={
					<div className="avatar avatar-placeholder">
						<div className="bg-base-200 text-base-content w-8 rounded-full">
							<Anonymous className="size-4" />
						</div>
					</div>
				}
			>
				<SignIn next={location.pathname} reason="You are anonymous here." />
			</Dropdown>
		);
	}

	const { name, avatar } = me.account;
	return (
		<>
			<Dropdown
				label={`Signed in as ${name}`}
				panel="w-56 p-2"
				trigger={
					<div className={`avatar ${avatar ? '' : 'avatar-placeholder'}`}>
						<div className="bg-base-200 text-base-content w-8 rounded-full">
							{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : name.slice(0, 1)}
						</div>
					</div>
				}
			>
				<ul className="menu w-full p-0">
					<li className="menu-title truncate">{name}</li>
					<li>
						<button type="button" onClick={() => profile.current?.showModal()}>
							Edit profile
						</button>
					</li>
					<li>
						<button type="button" onClick={() => void api.signOut().then(() => location.reload())}>
							Sign out
						</button>
					</li>
				</ul>
			</Dropdown>
			<Profile ref={profile} me={me} />
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
					<Account />
				</div>
			</div>
		</header>
	);
}
