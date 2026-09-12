import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEXT = 'エージェント基盤はどの層から着手すべきだとお考えでしょうか。';

const model = vi.hoisted(() => ({ batches: [] as string[][], error: null as string | null }));

// The AI binding would need credentials the test worker has none of.
vi.mock('./translate', async (importOriginal) => ({
	...(await importOriginal<typeof import('./translate')>()),
	WorkersAiTranslator: class {
		async translate(items: { id: string; text: string }[]) {
			model.batches.push(items.map((item) => item.id));
			return items.map((item) =>
				model.error
					? { id: item.id, headline: null, full: '', error: model.error }
					: { id: item.id, headline: `headline for ${item.id}`, full: `full for ${item.id}` },
			);
		}
	},
}));

function room(name: string) {
	return env.ROOM.getByName(name);
}

function alarmAt(stub: DurableObjectStub) {
	return runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
}

function dropAlarm(stub: DurableObjectStub) {
	return runInDurableObject(stub, (_instance, state) => state.storage.deleteAlarm());
}

beforeEach(() => {
	model.batches.length = 0;
	model.error = null;
});

describe('translation queue', () => {
	it('translates without being prodded', async () => {
		const r = room('unprodded');

		await r.postQuestion({ id: 'q1', text: TEXT });

		await vi.waitFor(
			async () => {
				const { questions } = await r.snapshot({ view: 'moderator' });
				expect(questions[0]?.translation).toEqual({
					ok: true,
					headline: 'headline for q1',
					full: 'full for q1',
				});
			},
			{ interval: 100, timeout: 5000 },
		);
	});

	it('has a burst of arrivals share one pass', async () => {
		const r = room('schedule');

		await r.postQuestion({ id: 'q1', text: TEXT });
		const scheduled = await alarmAt(r);
		await r.postQuestion({ id: 'q2', text: TEXT });
		const unchanged = await alarmAt(r);
		// Or it fires into a later test's count.
		await dropAlarm(r);

		expect(scheduled).not.toBeNull();
		expect(unchanged).toBe(scheduled);
	});

	it('stores what came back against the question that was asked about', async () => {
		const r = room('translate');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });

		await runDurableObjectAlarm(r);

		const { questions } = await r.snapshot({ view: 'moderator' });
		expect(questions.map((q) => [q.id, q.translation])).toEqual([
			['q1', { ok: true, headline: 'headline for q1', full: 'full for q1' }],
			['q2', { ok: true, headline: 'headline for q2', full: 'full for q2' }],
		]);
	});

	it('comes back for what one batch left behind, and then stops', async () => {
		const r = room('batch');
		for (const id of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
			await r.postQuestion({ id, text: TEXT });
		}

		await runDurableObjectAlarm(r);
		const between = await alarmAt(r);
		await runDurableObjectAlarm(r);

		expect(model.batches).toEqual([['q1', 'q2', 'q3', 'q4', 'q5'], ['q6']]);
		expect(between).not.toBeNull();
		expect(await alarmAt(r)).toBeNull();
	});

	it('tries a failing question a few times and then leaves it alone', async () => {
		const r = room('failure');
		model.error = '3040: capacity temporarily exceeded';
		await r.postQuestion({ id: 'q1', text: TEXT });

		await runDurableObjectAlarm(r);
		await runDurableObjectAlarm(r);
		await runDurableObjectAlarm(r);
		const givenUp = await runDurableObjectAlarm(r);

		expect(model.batches).toEqual([['q1'], ['q1'], ['q1']]);
		expect(givenUp).toBe(false);
		const { questions } = await r.snapshot({ view: 'moderator' });
		expect(questions[0]?.translation).toEqual({
			ok: false,
			error: '3040: capacity temporarily exceeded',
			attempts: 3,
		});
	});

	it('spends nothing on a question the moderator dismissed', async () => {
		const r = room('dismissed');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.setStatus({ id: 'q1', status: 'dismissed' });

		await runDurableObjectAlarm(r);

		expect(model.batches).toEqual([]);
		const { questions } = await r.snapshot({ view: 'moderator' });
		expect(questions[0]?.translation).toBeNull();
	});

	it('steps over a row it cannot read rather than stopping at it', async () => {
		const r = room('corrupt');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });
		await runInDurableObject(r, (_instance, state) => {
			state.storage.sql.exec(`UPDATE questions SET translation = '{not json' WHERE id = 'q1'`);
		});

		await runDurableObjectAlarm(r);

		expect(model.batches).toEqual([['q2']]);
	});

	it('picks up a question left waiting by an alarm that never ran', async () => {
		const r = room('revive');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await dropAlarm(r);

		await evictDurableObject(r);

		expect(await alarmAt(r)).not.toBeNull();
		await dropAlarm(r);
	});
});
