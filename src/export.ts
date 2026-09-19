import type { Question } from './protocol';

const HEADER = ['id', 'created_at', 'status', 'votes', 'asker', 'text', 'headline', 'translation'];

/** Excel reads a file without the byte order mark as the local legacy encoding. */
const BOM = '﻿';

function cell(value: string | number | null): string {
	const text = value === null ? '' : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Every question the operator can see, oldest first; the dismissed keep their text. */
export function toCsv(questions: Question[]): string {
	const rows = [...questions]
		.sort((a, b) => a.createdAt - b.createdAt)
		.map((question) => {
			const translation = question.translation?.ok ? question.translation : null;
			return [
				question.id,
				new Date(question.createdAt).toISOString(),
				question.status,
				question.votes,
				question.asker?.name ?? null,
				question.text,
				translation?.headline ?? null,
				translation?.full ?? null,
			];
		});
	return `${BOM}${[HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
