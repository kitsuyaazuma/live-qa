import { env, exports } from 'cloudflare:workers';
import { serializeSigned } from 'hono/utils/cookie';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from './accounts';

async function sessionFor(email: string): Promise<Record<string, string>> {
	const account = await signIn(env.DB, {
		provider: 'github',
		providerId: email,
		email,
		name: email.split('@')[0] ?? email,
		avatar: null,
	});
	const cookie = await serializeSigned('session', account.id, 'test-secret');
	return { cookie: cookie.split(';')[0] ?? '' };
}

let ADMIN: Record<string, string> = {};
let VISITOR: Record<string, string> = {};
beforeAll(async () => {
	ADMIN = await sessionFor('admin@example.com');
	VISITOR = await sessionFor('visitor@example.com');
});

function call(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`https://example.com${path}`, init));
}

function json(path: string, method: string, headers: Record<string, string>, body?: unknown) {
	return call(path, {
		method,
		headers: { ...headers, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

const create = (id: string, headers = ADMIN) => json('/api/rooms', 'POST', headers, { id });

describe('rooms', () => {
	it('lets an admin create a room once', async () => {
		const first = await create('keynote');
		const again = await create('keynote');

		expect(first.status).toBe(201);
		expect(await first.json()).toMatchObject({ room: { id: 'keynote' } });
		expect(again.status).toBe(409);
	});

	it('keeps scratch names for load tests and the door shut for everyone else', async () => {
		const scratch = await create('scratch-mine');
		const visitor = await create('visitors', VISITOR);
		const anonymous = await create('nobodys', {});

		expect([scratch.status, visitor.status, anonymous.status]).toEqual([400, 403, 401]);
	});

	it('answers 404 for a room nobody created, from every side', async () => {
		const info = await call('/api/rooms/ghost');
		const read = await call('/api/rooms/ghost/questions');
		const post = await json(
			'/api/rooms/ghost/questions',
			'POST',
			{ 'cf-connecting-ip': 'ghost' },
			{
				id: 'q1',
				text: 'anyone there?',
			},
		);
		const stream = await call('/api/rooms/ghost/events', { headers: ADMIN });

		expect([info.status, read.status, post.status, stream.status]).toEqual([404, 404, 404, 404]);
	});

	it('tells a browser whether it may run the room', async () => {
		await create('runnable');

		const admin = (await call('/api/rooms/runnable', { headers: ADMIN }).then((r) => r.json())) as {
			operator: boolean;
		};
		const visitor = (await call('/api/rooms/runnable', { headers: VISITOR }).then((r) =>
			r.json(),
		)) as { operator: boolean };
		const anonymous = (await call('/api/rooms/runnable').then((r) => r.json())) as {
			operator: boolean;
		};

		expect([admin.operator, visitor.operator, anonymous.operator]).toEqual([true, false, false]);
	});

	it('lists every room to an admin and only theirs to an operator', async () => {
		await create('listed-1');
		await create('listed-2');
		await json('/api/rooms/listed-2/operators/visitor@example.com', 'PUT', ADMIN);

		const admin = (await call('/api/rooms', { headers: ADMIN }).then((r) => r.json())) as {
			rooms: { id: string }[];
		};
		const visitor = (await call('/api/rooms', { headers: VISITOR }).then((r) => r.json())) as {
			rooms: { id: string }[];
		};

		expect(admin.rooms.map((room) => room.id)).toEqual(
			expect.arrayContaining(['listed-1', 'listed-2']),
		);
		expect(visitor.rooms.map((room) => room.id)).toEqual(['listed-2']);
	});

	it('matches an operator whose provider spells the email in capitals', async () => {
		await create('cased');
		await json('/api/rooms/cased/operators/Mixed.Case@Example.com', 'PUT', ADMIN);
		const mixed = await sessionFor('Mixed.Case@Example.com');

		const listed = (await call('/api/rooms', { headers: mixed }).then((r) => r.json())) as {
			rooms: { id: string }[];
		};
		const stream = await call('/api/rooms/cased/events', { headers: mixed });

		expect(listed.rooms.map((room) => room.id)).toEqual(['cased']);
		expect(stream.status).toBe(200);
	});

	it('deletes a room for an admin and for nobody else', async () => {
		await create('doomed');

		const visitor = await call('/api/rooms/doomed', { method: 'DELETE', headers: VISITOR });
		const admin = await call('/api/rooms/doomed', { method: 'DELETE', headers: ADMIN });
		const after = await call('/api/rooms/doomed');

		expect(visitor.status).toBe(403);
		expect(await admin.json()).toEqual({ deleted: 'doomed' });
		expect(after.status).toBe(404);
	});
});

describe('operators', () => {
	it('opens the room to an email an admin adds, and closes it again', async () => {
		await create('staffed');
		const before = await call('/api/rooms/staffed/events', { headers: VISITOR });

		const added = await json('/api/rooms/staffed/operators/Visitor@Example.com', 'PUT', ADMIN);
		const during = await call('/api/rooms/staffed/events', { headers: VISITOR });
		const removed = await json('/api/rooms/staffed/operators/visitor@example.com', 'DELETE', ADMIN);
		const after = await call('/api/rooms/staffed/events', { headers: VISITOR });

		expect(before.status).toBe(403);
		expect(await added.json()).toMatchObject({ operators: [{ email: 'visitor@example.com' }] });
		expect(during.status).toBe(200);
		expect(await removed.json()).toEqual({ operators: [] });
		expect(after.status).toBe(403);
	});

	it('takes only addresses, and only from admins', async () => {
		await create('picky');

		const garbage = await json('/api/rooms/picky/operators/not-an-address', 'PUT', ADMIN);
		const visitor = await json('/api/rooms/picky/operators/x@example.com', 'PUT', VISITOR);
		const scratch = await json('/api/rooms/scratch-picky/operators/x@example.com', 'PUT', ADMIN);
		const scratchOff = await json(
			'/api/rooms/scratch-picky/operators/x@example.com',
			'DELETE',
			ADMIN,
		);

		expect([garbage.status, visitor.status, scratch.status, scratchOff.status]).toEqual([
			400, 403, 400, 400,
		]);
	});
});
