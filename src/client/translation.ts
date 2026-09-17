import { useState } from 'react';
import type { Question } from '../protocol';
import { rememberTranslationShown, translationShown } from './storage';

/** Which translated line this screen shows. The operator reads to decide and
 * the stage reads aloud, so the two want different lines and neither is told
 * by the room: it is a reading preference, kept per browser. */
export const TRANSLATION_SHOWN = ['headline', 'full', 'none'] as const;

export type TranslationShown = (typeof TRANSLATION_SHOWN)[number];

export function useTranslationShown(): [TranslationShown, (shown: TranslationShown) => void] {
	const [shown, setShown] = useState<TranslationShown>(translationShown);
	return [
		shown,
		(next) => {
			rememberTranslationShown(next);
			setShown(next);
		},
	];
}

/** A missing headline falls back to the full line, not to the original alone. */
export function shownLine(question: Question, shown: TranslationShown): string | null {
	const translation = question.translation;
	if (!translation?.ok || shown === 'none') return null;
	return shown === 'full' ? translation.full : (translation.headline ?? translation.full);
}
