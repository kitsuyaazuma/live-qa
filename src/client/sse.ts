import type { Snapshot } from '../protocol';

/** A heartbeat comment comes out as null, so the caller sees the stream is alive.
 * Decoded by hand: TextDecoderStream is missing two Safari versions back. */
export async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<Snapshot | null> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) return;
			buffered += decoder.decode(value, { stream: true });
			let end = buffered.indexOf('\n\n');
			while (end !== -1) {
				const data = buffered
					.slice(0, end)
					.split('\n')
					.find((line) => line.startsWith('data: '));
				buffered = buffered.slice(end + 2);
				end = buffered.indexOf('\n\n');
				yield data ? (JSON.parse(data.slice(6)) as Snapshot) : null;
			}
		}
	} finally {
		reader.releaseLock();
	}
}
