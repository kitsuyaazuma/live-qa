import { SUPPORTED_MODELS, type SupportedModel, type TranslationSettings } from './translate';

function required(value: string | undefined, name: string): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new Error(`${name} is not set; see wrangler.jsonc vars`);
	}
	return trimmed;
}

/** Rejected at startup rather than as a runtime error mid-event. */
function requiredModel(value: string | undefined): SupportedModel {
	const model = required(value, 'TRANSLATION_MODEL');
	if (!(SUPPORTED_MODELS as readonly string[]).includes(model)) {
		throw new Error(`TRANSLATION_MODEL ${model} is not one of: ${SUPPORTED_MODELS.join(', ')}`);
	}
	return model as SupportedModel;
}

export function translationSettingsFromEnv(env: Env): TranslationSettings {
	return {
		model: requiredModel(env.TRANSLATION_MODEL),
		targetLang: required(env.TRANSLATION_TARGET_LANG, 'TRANSLATION_TARGET_LANG'),
		sourceLang: env.TRANSLATION_SOURCE_LANG?.trim() || undefined,
		context: env.TRANSLATION_CONTEXT?.trim() ?? '',
	};
}
