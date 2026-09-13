import { type RefObject, useLayoutEffect, useRef } from 'react';

const SLIDE_MS = 320;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Slides children to where they moved. Identity is `data-key`; offsets are
 * against the list, so a scroll is not mistaken for a move. Runs every render:
 * nothing moved, nothing animates.
 */
export function useFlip(list: RefObject<HTMLElement | null>): void {
	const seen = useRef(new Map<string, { top: number; left: number }>());

	useLayoutEffect(() => {
		const parent = list.current;
		if (!parent) return;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const next = new Map<string, { top: number; left: number }>();

		for (const child of parent.children) {
			if (!(child instanceof HTMLElement) || !child.dataset.key) continue;
			const place = { top: child.offsetTop, left: child.offsetLeft };
			next.set(child.dataset.key, place);
			if (still) continue;

			const before = seen.current.get(child.dataset.key);
			if (!before) {
				if (seen.current.size > 0) {
					child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: EASE });
				}
				continue;
			}
			const dy = before.top - place.top;
			const dx = before.left - place.left;
			if (dy === 0 && dx === 0) continue;
			child.animate(
				[{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
				{ duration: SLIDE_MS, easing: EASE },
			);
		}
		seen.current = next;
	});
}
