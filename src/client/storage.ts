/** What this browser remembers. The server only ever sees the opaque voter id. */

type Remembered = 'votes' | 'asked';

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// A private window refuses; nothing then outlives the tab.
	}
}

export function voterId(): string {
	const existing = read('live-qa.voter');
	if (existing) return existing;
	const created = crypto.randomUUID();
	write('live-qa.voter', created);
	return created;
}

function key(roomId: string, kind: Remembered): string {
	return `live-qa.${kind}.${roomId}`;
}

export function recall(roomId: string, kind: Remembered): Set<string> {
	try {
		const stored = JSON.parse(read(key(roomId, kind)) ?? '[]') as unknown;
		return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
	} catch {
		return new Set();
	}
}

export function remember(roomId: string, kind: Remembered, id: string, keep: boolean): Set<string> {
	const ids = recall(roomId, kind);
	if (keep) ids.add(id);
	else ids.delete(id);
	write(key(roomId, kind), JSON.stringify([...ids]));
	return ids;
}

/** One deployment, one moderator token, so it is not kept per room. */
export function operatorToken(): string {
	return read('live-qa.token') ?? '';
}

export function rememberOperatorToken(token: string): void {
	write('live-qa.token', token);
}

export function translationShown(): 'headline' | 'full' | 'none' {
	const stored = read('live-qa.shown');
	return stored === 'full' || stored === 'none' ? stored : 'headline';
}

export function rememberTranslationShown(shown: string): void {
	write('live-qa.shown', shown);
}

export type Theme = 'light' | 'dark';

export function themePreference(): Theme | null {
	const stored = read('live-qa.theme');
	return stored === 'light' || stored === 'dark' ? stored : null;
}

export function rememberTheme(theme: Theme): void {
	write('live-qa.theme', theme);
}
