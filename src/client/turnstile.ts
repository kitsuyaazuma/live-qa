export interface Turnstile {
	render(
		container: HTMLElement,
		options: {
			sitekey: string;
			theme?: 'auto' | 'light' | 'dark';
			appearance?: 'always' | 'execute' | 'interaction-only';
			callback: (token: string) => void;
			'error-callback'?: () => void;
			'before-interactive-callback'?: () => void;
		},
	): string;
	remove(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: Turnstile;
		onTurnstileLoad?: () => void;
	}
}

const SCRIPT =
	'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';

let loading: Promise<Turnstile> | undefined;

export function loadTurnstile(): Promise<Turnstile> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	loading ??= new Promise((resolve, reject) => {
		window.onTurnstileLoad = () => resolve(window.turnstile as Turnstile);
		const script = document.createElement('script');
		script.src = SCRIPT;
		script.async = true;
		script.onerror = () => {
			loading = undefined;
			reject(new Error('could not load the check'));
		};
		document.head.append(script);
	});
	return loading;
}
