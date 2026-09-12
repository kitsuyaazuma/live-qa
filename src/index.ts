import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

/** One instance per Q&A room, addressed by room id. */
export class Room extends DurableObject<Env> {
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
}

const app = new Hono<{ Bindings: Env }>();

export default app;
