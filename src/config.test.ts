import { describe, expect, it } from 'vitest';
import { translationSettingsFromEnv } from './config';

/**
 * Env declares TRANSLATION_MODEL as the literal in wrangler.jsonc, but a
 * deployment can override it, so the cast matches what actually arrives.
 */
function env(vars: Record<string, string>): Env {
	return vars as unknown as Env;
}

describe('translationSettingsFromEnv', () => {
	it('reads a supported model, the language pair and trimmed context', () => {
		const settings = translationSettingsFromEnv(
			env({
				TRANSLATION_MODEL: '@cf/qwen/qwen3.8-27b',
				TRANSLATION_TARGET_LANG: 'en',
				TRANSLATION_SOURCE_LANG: 'ja',
				TRANSLATION_CONTEXT: '  Event: Platform Engineering Kaigi 2026  ',
			}),
		);

		expect(settings).toEqual({
			model: '@cf/qwen/qwen3.8-27b',
			targetLang: 'en',
			sourceLang: 'ja',
			context: 'Event: Platform Engineering Kaigi 2026',
		});
	});

	it('rejects a model the translator was never compared against', () => {
		expect(() =>
			translationSettingsFromEnv(
				env({
					TRANSLATION_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
					TRANSLATION_TARGET_LANG: 'en',
				}),
			),
		).toThrow(/not one of/);
	});

	it('reads nothing when no model is configured', () => {
		expect(translationSettingsFromEnv(env({ TRANSLATION_TARGET_LANG: 'en' }))).toBeNull();
	});

	it('names the missing var rather than failing later', () => {
		expect(() =>
			translationSettingsFromEnv(env({ TRANSLATION_MODEL: '@cf/qwen/qwen3.8-27b' })),
		).toThrow(/TRANSLATION_TARGET_LANG is not set/);
	});
});
