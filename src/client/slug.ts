import { ID_MAX } from '../protocol';

/** Reduced to what survives a QR code and word of mouth. */
export function slug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, ID_MAX);
}
