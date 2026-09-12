import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';

it('reaches a room through its binding', async () => {
	const room = env.ROOM.getByName('smoke');

	await expect(room.sayHello('world')).resolves.toBe('Hello, world!');
});
