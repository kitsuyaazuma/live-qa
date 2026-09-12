import { DurableObject } from 'cloudflare:workers';

/** One instance per Q&A room, addressed by room id. */
export class Room extends DurableObject<Env> {
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
}

export default {
	async fetch(_request, _env, _ctx): Promise<Response> {
		return new Response('live-qa', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
