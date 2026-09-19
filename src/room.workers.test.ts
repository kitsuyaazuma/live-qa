import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { AskResult } from './protocol';

/** A room per test, so nothing depends on how the pool isolates storage. */
function room(name: string) {
	return env.ROOM.getByName(name);
}

const TEXT = 'エージェント基盤はどの層から着手すべきだとお考えでしょうか。';

/** Every room in these tests has room to spare. */
function stored(result: AskResult) {
	if ('status' in result) throw new Error('the room was full');
	return result;
}

describe('Room', () => {
	it('stores a question and advances the version', async () => {
		const r = room('store');

		const result = stored(await r.postQuestion({ id: 'q1', text: TEXT }));

		expect(result.created).toBe(true);
		expect(result.version).toBe(1);
		expect(result.question).toMatchObject({
			id: 'q1',
			text: TEXT,
			translation: null,
			votes: 0,
			status: 'published',
			version: 1,
		});
	});

	it('treats a repeated id as the same submission', async () => {
		const r = room('repost');
		await r.postQuestion({ id: 'q1', text: TEXT });

		const again = stored(await r.postQuestion({ id: 'q1', text: 'まったく別の文面' }));

		expect(again.created).toBe(false);
		expect(again.version).toBe(1);
		expect(again.question.text).toBe(TEXT);
		expect((await r.snapshot({ view: 'operator' })).questions).toHaveLength(1);
	});

	it('holds questions for review only while moderation is on', async () => {
		const r = room('moderate');

		const open = stored(await r.postQuestion({ id: 'q1', text: TEXT }));
		await r.setModeration(true);
		const held = stored(await r.postQuestion({ id: 'q2', text: TEXT }));

		expect(open.question.status).toBe('published');
		expect(held.question.status).toBe('pending');
		expect((await r.snapshot({ view: 'operator' })).moderated).toBe(true);
	});

	it('leaves questions pending when moderation is switched off', async () => {
		const r = room('unmoderate');
		await r.setModeration(true);
		await r.postQuestion({ id: 'q1', text: TEXT });

		await r.setModeration(false);

		const { moderated, questions } = await r.snapshot({ view: 'operator' });
		expect(moderated).toBe(false);
		expect(questions[0]?.status).toBe('pending');
	});

	it('refuses new questions while closed, but still takes a retry', async () => {
		const r = room('closed');
		const before = stored(await r.postQuestion({ id: 'q1', text: TEXT }));
		await r.setOpen(false);

		const refused = await r.postQuestion({ id: 'q2', text: TEXT });
		const retried = await r.postQuestion({ id: 'q1', text: TEXT });
		await r.setVote({ questionId: 'q1', voterId: 'v1', voted: true });
		await r.setOpen(true);
		const after = stored(await r.postQuestion({ id: 'q3', text: TEXT }));

		expect(refused).toEqual({ status: 'room-closed', version: before.version + 1 });
		expect('created' in retried && retried.created).toBe(false);
		expect((await r.snapshot({ view: 'audience' })).questions[0]?.votes).toBe(1);
		expect(after.created).toBe(true);
	});

	it('counts one vote per voter', async () => {
		const r = room('vote');
		await r.postQuestion({ id: 'q1', text: TEXT });
		const vote = (voterId: string, voted: boolean) =>
			r.setVote({ questionId: 'q1', voterId, voted });

		const first = await vote('alice', true);
		const repeat = await vote('alice', true);
		const other = await vote('bob', true);

		expect([first.status, repeat.status, other.status]).toEqual([
			'changed',
			'unchanged',
			'changed',
		]);
		expect([first, repeat, other].map((v) => ('votes' in v ? v.votes : null))).toEqual([1, 1, 2]);
		expect(repeat.version).toBe(first.version);
	});

	it('lets a voter take a vote back, and ignores taking it back twice', async () => {
		const r = room('unvote');
		await r.postQuestion({ id: 'q1', text: TEXT });
		const vote = (voted: boolean) => r.setVote({ questionId: 'q1', voterId: 'alice', voted });
		await vote(true);

		const removed = await vote(false);
		const again = await vote(false);

		expect([removed.status, again.status]).toEqual(['changed', 'unchanged']);
		expect([removed, again].map((v) => ('votes' in v ? v.votes : null))).toEqual([0, 0]);
		expect(again.version).toBe(removed.version);
	});

	it('lets the database refuse a negative vote count', async () => {
		const r = room('negative');
		await r.postQuestion({ id: 'q1', text: TEXT });

		const refused = await runInDurableObject(r, (_instance, state) => {
			try {
				state.storage.sql.exec(`UPDATE questions SET votes = votes - 1 WHERE id = 'q1'`);
				return false;
			} catch {
				return true;
			}
		});

		expect(refused).toBe(true);
	});

	it('reports a vote for an unknown question without consuming a version', async () => {
		const r = room('missing');
		await r.postQuestion({ id: 'q1', text: TEXT });

		const result = await r.setVote({ questionId: 'nope', voterId: 'alice', voted: true });

		expect(result).toEqual({ status: 'unknown-question', version: 1 });
	});

	it('moves a question through the statuses and ignores a repeat', async () => {
		const r = room('status');
		await r.postQuestion({ id: 'q1', text: TEXT });

		const answering = await r.setStatus({ id: 'q1', status: 'answering' });
		const again = await r.setStatus({ id: 'q1', status: 'answering' });
		const answered = await r.setStatus({ id: 'q1', status: 'answered' });

		expect([answering.status, again.status, answered.status]).toEqual([
			'changed',
			'unchanged',
			'changed',
		]);
		expect(again.version).toBe(answering.version);
		expect(answered.version).toBe(answering.version + 1);
	});

	it('refuses to send a reviewed question back to pending', async () => {
		const r = room('nopending');
		await r.postQuestion({ id: 'q1', text: TEXT });

		await runInDurableObject(r, async (instance) => {
			await expect(instance.setStatus({ id: 'q1', status: 'pending' })).rejects.toThrow(
				/status must be one of/,
			);
		});
	});

	it('demotes the question on screen when another starts', async () => {
		const r = room('answering');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });
		await r.setStatus({ id: 'q1', status: 'answering' });

		await r.setStatus({ id: 'q2', status: 'answering' });

		const byId = Object.fromEntries(
			(await r.snapshot({ view: 'operator' })).questions.map((q) => [q.id, q.status]),
		);
		expect(byId).toEqual({ q1: 'answered', q2: 'answering' });
	});

	it('lets the database refuse a second question on screen', async () => {
		const r = room('onlyone');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });
		await r.setStatus({ id: 'q1', status: 'answering' });

		const refused = await runInDurableObject(r, (_instance, state) => {
			try {
				state.storage.sql.exec(`UPDATE questions SET status = 'answering' WHERE id = 'q2'`);
				return false;
			} catch {
				return true;
			}
		});

		expect(refused).toBe(true);
	});

	it('stores a translation as json and reads it back', async () => {
		const r = room('translate');
		await r.postQuestion({ id: 'q1', text: TEXT });

		const applied = await r.applyTranslation({
			id: 'q1',
			result: { headline: 'Which layer first?', full: 'Which layer should we start with?' },
		});

		expect(applied.status).toBe('applied');
		expect('question' in applied && applied.question.translation).toEqual({
			ok: true,
			headline: 'Which layer first?',
			full: 'Which layer should we start with?',
		});
	});

	it('counts translation failures so a retry policy can read them', async () => {
		const r = room('retry');
		await r.postQuestion({ id: 'q1', text: TEXT });

		await r.applyTranslation({ id: 'q1', result: { error: '5035: not available' } });
		const second = await r.applyTranslation({ id: 'q1', result: { error: 'timed out' } });

		expect('question' in second && second.question.translation).toEqual({
			ok: false,
			error: 'timed out',
			attempts: 2,
		});
	});

	it('surfaces an unparseable stored translation instead of throwing', async () => {
		const r = room('corrupt');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await runInDurableObject(r, (_instance, state) => {
			state.storage.sql.exec(`UPDATE questions SET translation = '{not json' WHERE id = 'q1'`);
		});

		const { questions } = await r.snapshot({ view: 'operator' });

		expect(questions[0]?.translation).toEqual({
			ok: false,
			error: 'stored translation is not valid json',
			attempts: 0,
		});
	});

	it('stamps each changed row with the version at which it changed', async () => {
		const r = room('stamp');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });
		await r.setVote({ questionId: 'q1', voterId: 'alice', voted: true });

		const { version, questions } = await r.snapshot({ view: 'operator' });

		expect(version).toBe(3);
		expect(questions.map((q) => [q.id, q.version])).toEqual([
			['q2', 2],
			['q1', 3],
		]);
	});

	it('returns only what changed after a version', async () => {
		const r = room('diff');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });

		const since = await r.snapshot({ view: 'operator', since: 1 });

		expect(since.version).toBe(2);
		expect(since.questions.map((q) => q.id)).toEqual(['q2']);
	});

	it('keeps the version and the moderation flag across eviction', async () => {
		const r = room('evict');
		await r.setModeration(true);
		await r.postQuestion({ id: 'q1', text: TEXT });

		await evictDurableObject(r);

		const revived = room('evict');
		const after = await revived.snapshot({ view: 'operator' });
		expect(after.version).toBe(2);
		expect(after.moderated).toBe(true);

		const next = await revived.postQuestion({ id: 'q2', text: TEXT });
		expect(next.version).toBe(3);
	});

	it('archives every question at once and blanks them for the audience', async () => {
		const r = room('archive');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.postQuestion({ id: 'q2', text: TEXT });
		await r.setStatus({ id: 'q1', status: 'answering' });

		const cleared = await r.archive();
		const again = await r.archive();
		const fresh = stored(await r.postQuestion({ id: 'q3', text: TEXT }));

		expect(cleared).toEqual({ version: 4, archived: 2 });
		expect(again).toEqual({ version: 4, archived: 0 });
		expect(fresh.question.status).toBe('published');
		const seen = (await r.snapshot({ view: 'audience' })).questions;
		expect(seen.map((q) => [q.id, q.status, q.text])).toEqual([
			['q1', 'archived', ''],
			['q2', 'archived', ''],
			['q3', 'published', TEXT],
		]);
	});

	it('rebuilds a questions table from before archiving existed', async () => {
		const r = room('legacy');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await runInDurableObject(r, (_instance, state) => {
			state.storage.sql.exec(`
				ALTER TABLE questions RENAME TO questions_then;
				CREATE TABLE questions (
					id TEXT PRIMARY KEY,
					text TEXT NOT NULL,
					translation TEXT,
					votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
					status TEXT NOT NULL DEFAULT 'pending'
						CHECK (status IN ('pending', 'published', 'answering', 'answered', 'dismissed')),
					version INTEGER NOT NULL,
					created_at INTEGER NOT NULL,
					asker TEXT
				) STRICT;
				INSERT INTO questions SELECT * FROM questions_then;
				DROP TABLE questions_then;`);
		});
		await evictDurableObject(r);

		const revived = room('legacy');
		const cleared = await revived.archive();
		const indexes = await runInDurableObject(revived, (_instance, state) =>
			state.storage.sql
				.exec<{ name: string }>(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'questions' AND sql IS NOT NULL",
				)
				.toArray()
				.map((row) => row.name)
				.sort(),
		);

		expect(cleared).toEqual({ version: 2, archived: 1 });
		expect(indexes).toEqual(['questions_answering', 'questions_version']);
	});

	it('keeps dismissed text for the operator and withholds it from the audience', async () => {
		const r = room('dismiss');
		await r.postQuestion({ id: 'q1', text: TEXT });
		await r.setStatus({ id: 'q1', status: 'dismissed' });

		const seen = await r.snapshot({ view: 'audience' });
		const audited = await r.snapshot({ view: 'operator' });

		expect(seen.questions).toEqual([
			expect.objectContaining({ id: 'q1', status: 'dismissed', text: '', translation: null }),
		]);
		expect(audited.questions[0]?.text).toBe(TEXT);
	});

	it('hides questions still awaiting review from the audience', async () => {
		const r = room('hidden');
		await r.setModeration(true);
		await r.postQuestion({ id: 'q1', text: TEXT });

		expect((await r.snapshot({ view: 'audience' })).questions).toEqual([]);
		expect((await r.snapshot({ view: 'operator' })).questions).toHaveLength(1);
	});

	it('schedules no translation when no model is configured', async () => {
		const r = room('untranslated');
		await r.postQuestion({ id: 'q1', text: TEXT });

		const alarm = await runInDurableObject(r, (_instance, state) => state.storage.getAlarm());

		expect(alarm).toBeNull();
	});

	it('rejects text and ids it will not store', async () => {
		const r = room('reject');

		await runInDurableObject(r, async (instance) => {
			const post = (id: string, text: string) => instance.postQuestion({ id, text });
			await expect(post('q1', '   ')).rejects.toThrow(/text must be/);
			await expect(post('q1', 'x'.repeat(2001))).rejects.toThrow(/text must be/);
			await expect(post('', TEXT)).rejects.toThrow(/id must be/);
		});

		expect((await r.snapshot({ view: 'operator' })).version).toBe(0);
	});
});

describe('askers', () => {
	it('keeps who asked, and takes it off what the audience must not see', async () => {
		const r = room('askers');
		const text = 'エージェント基盤はどの層から着手すべきでしょうか。';
		const first = await r.postQuestion({ id: 'q1', text, asker: { name: 'Aki', avatar: null } });
		const retried = await r.postQuestion({ id: 'q1', text, asker: null });
		await r.postQuestion({ id: 'q2', text });
		await r.setStatus({ id: 'q1', status: 'dismissed' });

		const audience = await r.snapshot({ view: 'audience' });
		const operator = await r.snapshot({ view: 'operator' });

		expect(stored(first).question.asker).toEqual({ name: 'Aki', avatar: null });
		expect(stored(retried).question.asker).toEqual({ name: 'Aki', avatar: null });
		expect(operator.questions.find((q) => q.id === 'q1')?.asker).toEqual({
			name: 'Aki',
			avatar: null,
		});
		expect(audience.questions.find((q) => q.id === 'q1')?.asker).toBeNull();
		expect(operator.questions.find((q) => q.id === 'q2')?.asker).toBeNull();
	});
});
