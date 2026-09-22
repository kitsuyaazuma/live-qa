import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * The shape of a keynote Q&A rather than a flat request rate. Votes all land on
 * one question: the worst case for a single-threaded object, and what really
 * happens to a popular question.
 */

const BASE_URL = __ENV.BASE_URL;
/** What one machine can hold over wifi, not what the event will be. */
const READERS = Number(__ENV.READERS ?? 250);
const VOTES_PER_SECOND = Number(__ENV.VOTES_PER_SECOND ?? 30);
const QUESTIONS_PER_SECOND = Number(__ENV.QUESTIONS_PER_SECOND ?? 2);
const POLL_SECONDS = Number(__ENV.POLL_SECONDS ?? 2);
/** Required: a room whose name is lost can never be emptied again. */
const ROOM = __ENV.ROOM;
const RAMP = __ENV.RAMP ?? '30s';
const HOLD = __ENV.HOLD ?? '2m';
/** Failures logged per VU; every line would be thousands. */
const SAMPLES = 3;

const notModified = new Rate('read_not_modified');
/** Goes negative when other writers moved the room on, so it measures churn as
 * much as the asker's wait. `own_question_visible` is the unambiguous one. */
const ownWriteLag = new Trend('own_write_lag');
/** Whether an asker sees their own question the moment after posting. */
const ownQuestionVisible = new Rate('own_question_visible');
const rejectedWrites = new Counter('writes_rejected');
const rejectedReads = new Counter('reads_rejected');

/** A rate cannot say whether a failure was a 429, a 404 or a dropped dial. */
function sample(label, response) {
	if (__ITER >= SAMPLES) return;
	// Status 0 means no response arrived: the generator's limit, not the worker's.
	const detail = response.error_code
		? `error_code=${response.error_code} ${response.error}`
		: String(response.body ?? '').slice(0, 200);
	console.error(`${label} status=${response.status} ${detail}`);
}

const scenarios = {};

if (READERS > 0) {
	scenarios.readers = {
		executor: 'ramping-vus',
		exec: 'poll',
		startVUs: 0,
		stages: [
			{ duration: RAMP, target: READERS },
			{ duration: HOLD, target: READERS },
		],
	};
}

/** What one device may do per window, from the device limits in wrangler.jsonc. */
const PER_DEVICE = { askQuestion: 5, castVote: 30 };
const WINDOW_SECONDS = 10;
/** k6 hands an iteration to whichever user is free, so shares are even only on average. */
const SPARE = 0.4;

function devicesFor(exec, rate) {
	return Math.ceil((rate * WINDOW_SECONDS) / (PER_DEVICE[exec] * (1 - SPARE)));
}

/** Arrival-rate executors reject a rate of zero, so an unwanted one is omitted. */
function arrivals(exec, rate) {
	const devices = Math.max(10, devicesFor(exec, rate));
	return {
		executor: 'constant-arrival-rate',
		exec,
		rate,
		timeUnit: '1s',
		duration: HOLD,
		preAllocatedVUs: devices,
		// A generous ceiling spirals: failed dials are slow, slow iterations make
		// the executor add users, and those connections fail in turn.
		maxVUs: devices * 2,
		startTime: READERS > 0 ? RAMP : '0s',
	};
}

if (VOTES_PER_SECOND > 0) scenarios.voters = arrivals('castVote', VOTES_PER_SECOND);
if (QUESTIONS_PER_SECOND > 0) scenarios.writers = arrivals('askQuestion', QUESTIONS_PER_SECOND);

export const options = {
	scenarios,
	// k6 empties the cookie jar between iterations otherwise, and the device cookie with it.
	noCookiesReset: true,
	// The latencies are what the run is for; a guessed pass mark would hide them.
	thresholds: {
		http_req_failed: ['rate<0.01'],
	},
};

function questionsUrl(room) {
	return `${BASE_URL}/api/rooms/${room}/questions`;
}

let claimed = false;

function claimDevice() {
	if (claimed) return;
	const response = http.post(`${BASE_URL}/api/device`, null);
	if (response.status !== 204) {
		throw new Error(`could not claim a device: ${response.status} ${response.body}`);
	}
	claimed = true;
}

export function setup() {
	if (!BASE_URL) throw new Error('set BASE_URL to the deployed worker');

	if (!ROOM?.startsWith('scratch-')) {
		throw new Error(`set ROOM to a scratch- name so the room can be emptied, got ${ROOM}`);
	}

	const room = ROOM;
	claimDevice();
	const seed = http.post(
		questionsUrl(room),
		JSON.stringify({ id: 'seed', text: '最初の質問です。どの層から着手すべきでしょうか。' }),
		{ headers: { 'content-type': 'application/json' } },
	);
	// 200 rather than 201 means the seed was already there, which is fine; the
	// count is reported because questions left over change the measurement.
	if (seed.status !== 201 && seed.status !== 200) {
		throw new Error(`could not seed room ${room}: ${seed.status} ${seed.body}`);
	}

	const existing = (http.get(questionsUrl(room)).json('questions') ?? []).length;
	console.log(`room ${room} starting with ${existing} question(s)`);
	return { room };
}

/** One virtual user is one audience member holding the page open. */
let lastEtag = null;

export function poll(data) {
	const headers = lastEtag ? { 'if-none-match': lastEtag } : {};
	const response = http.get(questionsUrl(data.room), { headers });

	const answered = response.status === 200 || response.status === 304;
	notModified.add(response.status === 304);
	check(response, { 'read answered': () => answered });
	if (!answered) {
		rejectedReads.add(1);
		sample('read', response);
	}

	if (response.status === 200) {
		lastEtag = response.headers.Etag ?? response.headers.etag ?? null;
		// Without this the 304 rate would read as zero and look like a finding.
		check(response, { 'etag readable': () => lastEtag !== null });
	}

	sleep(POLL_SECONDS);
}

export function castVote(data) {
	claimDevice();
	// Toggled so every vote is a write; the same vote twice is a no-op.
	const response = http.put(
		`${questionsUrl(data.room)}/seed/vote`,
		JSON.stringify({ voted: __ITER % 2 === 0 }),
		{ headers: { 'content-type': 'application/json' } },
	);

	check(response, { 'vote counted': (r) => r.status === 200 });
	if (response.status !== 200) {
		rejectedWrites.add(1);
		sample('vote', response);
	}
}

/** Posts, then reads straight back: the gap is what an asker actually waits. */
export function askQuestion(data) {
	claimDevice();
	const id = `q-${__VU}-${__ITER}`;
	const posted = http.post(
		questionsUrl(data.room),
		JSON.stringify({ id, text: `負荷試験の質問 ${id} です。実運用の文面に近い長さにしています。` }),
		{ headers: { 'content-type': 'application/json' } },
	);

	check(posted, { 'question accepted': (r) => r.status === 201 });
	if (posted.status !== 201) {
		rejectedWrites.add(1);
		sample('post', posted);
		return;
	}

	const written = posted.json('version');
	const seen = http.get(questionsUrl(data.room));
	if (seen.status === 200) {
		ownWriteLag.add(written - seen.json('version'));
		const questions = seen.json('questions') ?? [];
		ownQuestionVisible.add(questions.some((q) => q.id === id));
	}
}
