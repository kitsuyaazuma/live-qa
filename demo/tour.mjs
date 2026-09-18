#!/usr/bin/env node

import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const BASE = new URL(process.env.BASE_URL ?? 'http://localhost:8080');
const SECRET = process.env.SESSION_SECRET;
const ROOM = process.env.ROOM ?? 'example';
const HOST_ID = process.env.HOST_ID ?? 'demo-host';
const GUEST_ID = process.env.GUEST_ID ?? 'demo-mika';
const CANVAS_PORT = 8899;
const SHOT = process.env.SHOT === '1';
const OUT = new URL('./out/', import.meta.url).pathname;

if (!SECRET) {
	console.error('set SESSION_SECRET to what the dev server was given');
	process.exit(1);
}
if (BASE.hostname !== 'localhost') {
	console.error(
		'the phones live on a.localhost and b.localhost, so BASE_URL has to be on localhost',
	);
	process.exit(1);
}

const Q1 = '本番障害のポストモーテムは、どのくらいの粒度で全社に共有していますか。';
const Q2 = '小さなチームでも、観測性に投資する順番はどう決めましたか。';
const Q3 = '新しい技術を採用するとき、撤退の基準はどう決めていますか。';

/** The same shape hono signs: value, a dot, the base64 hmac of the value. */
function session(userId) {
	const signature = createHmac('sha256', SECRET).update(userId).digest('base64');
	return encodeURIComponent(`${userId}.${signature}`);
}

/** A subdomain per phone keeps their voters apart; the cookie is on the bare host. */
function at(sub, path) {
	return `${BASE.protocol}//${sub ? `${sub}.` : ''}${BASE.host}${path}`;
}

async function api(method, path, body) {
	const response = await fetch(`${BASE.origin}${path}`, {
		method,
		headers: { 'content-type': 'application/json', cookie: `session=${session(HOST_ID)}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
	}
	return response.status === 404 ? null : response.json();
}

async function audience() {
	return (await (await fetch(`${BASE.origin}/api/rooms/${ROOM}/questions`)).json()).questions;
}

async function translated(text, timeoutMs = 45000) {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		const question = (await audience()).find((q) => q.text === text);
		if (question?.translation?.ok) return question;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`no translation arrived for: ${text}`);
}

await api('DELETE', `/api/rooms/${ROOM}`);
await api('POST', '/api/rooms', { id: ROOM });

const html = readFileSync(new URL('./canvas.html', import.meta.url), 'utf8')
	.replace('__A__', at('a', '/'))
	.replace('__B__', at('b', `/r/${ROOM}`))
	.replace('__S__', at('', `/r/${ROOM}/present`))
	.replace('__O__', at('', `/r/${ROOM}/admin`));
const canvas = createServer((_, res) => {
	res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
	res.end(html);
});
await new Promise((r) => canvas.listen(CANVAS_PORT, r));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
	channel: 'chromium',
	// A cross-origin iframe gets its own renderer, and the screencast behind the
	// video does not capture those, so the panes would record frozen.
	args: ['--disable-features=IsolateOrigins,site-per-process', '--disable-site-isolation-trials'],
});
const context = await browser.newContext({
	viewport: { width: 1920, height: 1080 },
	colorScheme: 'light',
	deviceScaleFactor: 1,
	...(SHOT ? {} : { recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } }),
});
await context.addCookies([
	{
		name: 'session',
		value: session(HOST_ID),
		domain: BASE.hostname,
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
	},
	{
		name: 'session',
		value: session(GUEST_ID),
		domain: `b.${BASE.hostname}`,
		path: '/',
		httpOnly: true,
		sameSite: 'None',
		secure: true,
	},
]);

// The recording has no cursor of its own, so every frame draws one.
await context.addInitScript(() => {
	addEventListener('DOMContentLoaded', () => {
		const dot = document.createElement('div');
		dot.style.cssText =
			'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;' +
			'border-radius:50%;background:rgba(255,120,60,.7);box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.4);' +
			'pointer-events:none;opacity:0;transition:opacity .2s';
		document.body.appendChild(dot);
		let idle;
		addEventListener('mousemove', (e) => {
			dot.style.opacity = '1';
			dot.style.left = `${e.clientX}px`;
			dot.style.top = `${e.clientY}px`;
			clearTimeout(idle);
			idle = setTimeout(() => {
				dot.style.opacity = '0';
			}, 1200);
		});
		addEventListener('mouseleave', () => {
			dot.style.opacity = '0';
		});
		addEventListener('mousedown', () => {
			dot.animate(
				[{ transform: 'scale(1)' }, { transform: 'scale(2.4)' }, { transform: 'scale(1)' }],
				300,
			);
		});
	});
});

const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
// The stage holds a stream open, so the network never goes idle.
await page.goto(`http://localhost:${CANVAS_PORT}/`, { waitUntil: 'domcontentloaded' });

const A = page.frameLocator('#a');
const B = page.frameLocator('#b');
const S = page.frameLocator('#s');
const O = page.frameLocator('#o');
// A signed-in header holds a hidden menu of <li>, so questions are found by list.
const cards = (frame, name) => frame.getByRole('list', { name }).locator('li');
const onStage = cards(S, 'Questions on the stage');

const started = Date.now();
const beat = (ms) => page.waitForTimeout(ms);
const mark = (what) => console.log(`${((Date.now() - started) / 1000).toFixed(1)}s ${what}`);

async function tap(locator) {
	const box = await locator.boundingBox();
	if (box) {
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
		await beat(140);
	}
	await locator.click();
}

async function write(frame, text) {
	const field = frame.getByRole('textbox', { name: 'Your question' });
	await tap(field);
	await field.pressSequentially(text, { delay: 45 });
	await beat(350);
	await tap(frame.getByRole('button', { name: 'Send' }));
}

await A.getByRole('button', { name: /Join/ }).waitFor();
await B.getByRole('textbox', { name: 'Your question' }).waitFor();
await S.getByText('Waiting for the first question.').waitFor();
await O.getByText('Nothing here.').waitFor();
const guest = await B.locator('body').evaluate(() => fetch('/api/me').then((r) => r.status));
mark(`scene 0: four panes, empty room; phone B ${guest === 200 ? 'is signed in' : 'is anonymous'}`);

if (SHOT) {
	await page.screenshot({ path: `${OUT}layout.png` });
	await context.close();
	await browser.close();
	canvas.close();
	process.exit(0);
}
await beat(2200);

await tap(A.getByRole('button', { name: /Join/ }));
const name = A.getByLabel('Room name');
await tap(name);
await name.pressSequentially(ROOM, { delay: 110 });
await beat(500);
await tap(A.getByRole('button', { name: 'Join', exact: true }));
await A.getByRole('textbox', { name: 'Your question' }).waitFor();
await beat(1200);

// The second question is typed while the first one's translation is on its way.
await write(A, Q1);
await onStage.first().waitFor();
mark('scene 2: on the stage');
await beat(1500);
await write(B, Q2);
await cards(B, 'Questions').nth(1).waitFor();
await translated(Q1);
await S.getByText(Q1).locator('..').getByText(/\w{4}/).first().waitFor({ timeout: 10000 });
mark('scene 2: translated');
await beat(2000);

const live = await audience();
const idOf = (text) => live.find((q) => q.text === text)?.id;
const [q1, q2] = [idOf(Q1), idOf(Q2)];
if (!q1 || !q2) throw new Error('could not find the two questions just asked');
await tap(B.locator(`li[data-key="${q1}"]`).getByLabel('Upvote this question'));
await beat(900);
for (const voter of ['v1', 'v2', 'v3', 'v4']) {
	await fetch(`${BASE.origin}/api/rooms/${ROOM}/questions/${q2}/vote`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ voterId: voter, voted: true }),
	});
}
mark('scene 3: votes are in');
await beat(3000);
await tap(A.getByRole('tab', { name: 'Recent' }));
await beat(1600);
await tap(A.getByRole('tab', { name: 'Popular' }));
await beat(1200);

await tap(S.getByLabel('Settings'));
await beat(900);
await tap(S.getByRole('radio', { name: /Full/ }));
await beat(2000);
await page.keyboard.press('Escape');
await beat(2000);

await tap(S.getByLabel('Settings'));
await beat(700);
await tap(S.getByRole('checkbox', { name: /Review before showing/ }));
await beat(1200);
await page.keyboard.press('Escape');
await A.getByText('Questions appear once reviewed.').waitFor({ timeout: 15000 });
mark('scene 5: the room is moderated');
await beat(1200);
await write(A, Q3);
await beat(2500);
mark(`scene 5: held back from the rest of the room: ${!(await B.getByText(Q3).isVisible())}`);
await tap(O.getByRole('tab', { name: /Review/ }));
await beat(1500);
await tap(O.getByLabel('Show to the audience'));
await B.getByText(Q3).waitFor({ timeout: 15000 });
mark('scene 5: published');
await beat(2500);

await tap(O.getByRole('tab', { name: /Live/ }));
await beat(1200);
await tap(O.locator(`li[data-key="${q1}"]`).getByLabel('Put on the stage'));
await S.locator(`li[data-key="${q1}"].bg-primary`).waitFor({ timeout: 15000 });
mark('scene 6: on the stage');
await beat(3000);
await tap(S.locator(`li[data-key="${q1}"]`).getByLabel('Mark answered'));
await beat(2500);

await tap(A.getByLabel('Filter'));
await beat(900);
await tap(A.getByRole('checkbox', { name: 'Answered', exact: true }));
await beat(1800);
await page.keyboard.press('Escape');
await beat(3500);
mark('scene 7: done');

await page.screenshot({ path: `${OUT}final.png` });
const video = page.video();
await context.close();
await video.saveAs(`${OUT}tour.webm`);
await video.delete();
await browser.close();
canvas.close();
console.log(`written ${OUT}tour.webm`);
