#!/usr/bin/env node

// Times the hop the event depends on: a moderator picks a question, and the
// screen behind the speaker has to show it. Everything else can be a poll away.

const base = process.env.BASE_URL?.replace(/\/$/, '');
const token = process.env.MODERATOR_TOKEN;
const room = process.env.ROOM ?? 'scratch-switch';
const rounds = Number(process.env.ROUNDS ?? 20);

if (!base || !token) {
	console.error('set BASE_URL and MODERATOR_TOKEN');
	process.exit(1);
}
if (!room.startsWith('scratch-')) {
	console.error(`${room} is not a scratch room, and this run leaves questions behind`);
	process.exit(1);
}

const rooms = `${base}/api/rooms/${room}`;
const auth = { authorization: `Bearer ${token}` };
const json = { 'content-type': 'application/json', ...auth };

async function seed(id) {
	const response = await fetch(`${rooms}/questions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id, text: `switch measurement ${id}` }),
	});
	if (response.status !== 201 && response.status !== 200) {
		throw new Error(`could not seed ${id}: ${response.status} ${await response.text()}`);
	}
}

/** Resolved by the reader below as soon as a frame carries the expected row. */
let awaited = null;

function watch(id) {
	return new Promise((resolve) => {
		awaited = { id, resolve };
	});
}

function received(diff) {
	if (!awaited) return;
	const shown = diff.questions.find(
		(question) => question.id === awaited.id && question.status === 'answering',
	);
	if (!shown) return;
	awaited.resolve(performance.now());
	awaited = null;
}

const stream = await fetch(`${rooms}/moderator/events`, { headers: auth });
if (!stream.ok) throw new Error(`the room refused a stream: ${stream.status}`);

let opened = false;
const reading = (async () => {
	let buffered = '';
	const decoder = new TextDecoder();
	for await (const chunk of stream.body) {
		buffered += decoder.decode(chunk, { stream: true });
		let end = buffered.indexOf('\n\n');
		while (end !== -1) {
			const event = buffered.slice(0, end);
			buffered = buffered.slice(end + 2);
			end = buffered.indexOf('\n\n');
			const data = event.split('\n').find((line) => line.startsWith('data: '));
			if (!data) continue;
			opened = true;
			received(JSON.parse(data.slice(6)));
		}
	}
})();

await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, 2000))]);
if (!opened) throw new Error('the stream sent nothing to open with');

await seed('switch-a');
await seed('switch-b');

const samples = [];
for (let round = 0; round < rounds; round += 1) {
	const id = round % 2 === 0 ? 'switch-a' : 'switch-b';
	const arrived = watch(id);
	const start = performance.now();
	const response = await fetch(`${rooms}/moderator/questions/${id}`, {
		method: 'PATCH',
		headers: json,
		body: JSON.stringify({ status: 'answering' }),
	});
	if (!response.ok) throw new Error(`the room refused the change: ${response.status}`);
	samples.push((await arrived) - start);
}

samples.sort((a, b) => a - b);
const at = (share) => samples[Math.min(samples.length - 1, Math.floor(samples.length * share))];
const ms = (value) => `${value.toFixed(0)}ms`;

const slowest = samples[samples.length - 1];
console.log(`room ${room}, ${samples.length} handovers`);
console.log(`  median ${ms(at(0.5))}  p95 ${ms(at(0.95))}  max ${ms(slowest)}  budget 1000ms`);

process.exit(slowest < 1000 ? 0 : 1);
