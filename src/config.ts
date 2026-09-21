import { SUPPORTED_MODELS, type SupportedModel, type TranslationSettings } from './translate';

/** Kept in step with the platform type by `satisfies`, since there is no
 * runtime list to read. */
const LOCATION_HINTS = [
	'wnam',
	'enam',
	'sam',
	'weur',
	'eeur',
	'apac',
	'apac-ne',
	'apac-se',
	'oc',
	'afr',
	'me',
] as const satisfies readonly DurableObjectLocationHint[];

let warnedAboutHint = false;

/**
 * Only honoured when the room is first created, and the runtime accepts an
 * unknown value silently — so a typo would place the room away from the venue
 * and never say so. Warned about rather than rejected: refusing would take the
 * event down over a placement preference if this list ever fell behind.
 */
export function roomLocationFromEnv(env: Env): DurableObjectLocationHint | undefined {
	const hint = env.ROOM_LOCATION_HINT?.trim();
	if (!hint) return undefined;
	// Once per isolate: this runs on the hot path, and a misconfigured hint would
	// otherwise log on every request of the event.
	if (!warnedAboutHint && !(LOCATION_HINTS as readonly string[]).includes(hint)) {
		warnedAboutHint = true;
		console.warn(`ROOM_LOCATION_HINT ${hint} is not a known location hint; it will be ignored`);
	}
	return hint as DurableObjectLocationHint;
}

function required(value: string | undefined, name: string): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new Error(`${name} is not set; see wrangler.jsonc vars`);
	}
	return trimmed;
}

/** Rejected at startup rather than as a runtime error mid-event. */
function requiredModel(value: string): SupportedModel {
	if (!(SUPPORTED_MODELS as readonly string[]).includes(value)) {
		throw new Error(`TRANSLATION_MODEL ${value} is not one of: ${SUPPORTED_MODELS.join(', ')}`);
	}
	return value as SupportedModel;
}

export interface TurnstileSettings {
	siteKey: string;
	secret: string;
}

export function turnstileFromEnv(env: Env): TurnstileSettings | null {
	const siteKey = env.TURNSTILE_SITE_KEY?.trim();
	const secret = env.TURNSTILE_SECRET_KEY?.trim();
	if (!siteKey && !secret) return null;
	if (!siteKey || !secret) {
		throw new Error('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set together or not at all');
	}
	return { siteKey, secret };
}

/** No model means no translation: a speaker can share the audience's language. */
export function translationSettingsFromEnv(env: Env): TranslationSettings | null {
	const model = env.TRANSLATION_MODEL?.trim();
	if (!model) return null;

	return {
		model: requiredModel(model),
		targetLang: required(env.TRANSLATION_TARGET_LANG, 'TRANSLATION_TARGET_LANG'),
		sourceLang: env.TRANSLATION_SOURCE_LANG?.trim() || undefined,
		context: env.TRANSLATION_CONTEXT?.trim() ?? '',
	};
}
