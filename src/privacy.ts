import { turnstileFromEnv } from './config';

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function privacyPage(env: Env): string {
	const operator = escapeHtml(env.PRIVACY_OPERATOR?.trim() || 'the organiser');
	const contact = escapeHtml(env.PRIVACY_CONTACT?.trim() ?? '');
	const asking = contact ? ` Ask ${contact} for either.` : '';
	const check = turnstileFromEnv(env)
		? `<p><strong>Bot check.</strong> Before your first question or vote, Cloudflare Turnstile checks that a person is behind the browser. What it processes is covered by Cloudflare's privacy policy.</p>
`
		: '';

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Privacy</title>
<style>
body { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; font: 16px/1.6 system-ui, sans-serif; }
h1 { font-size: 1.5rem; }
</style>
</head>
<body>
<h1>Privacy</h1>
<p>This Live Q&amp;A is run by ${operator}, on their own Cloudflare account.</p>
<p><strong>Asking and voting.</strong> Questions are stored with the room. Your browser is given a random id in a cookie so you can upvote once and take your own question back; it is not linked to who you are. Unless you sign in, that is all.</p>
${check}<p><strong>Signing in.</strong> You may sign in with Google or GitHub to ask under your name; hosts and operators must. We receive and store your name, email address, profile picture and the provider's account id. The name and picture are shown on questions you ask under your name and next to rooms you run; the email address is used to recognise operators and to let you back in. We read nothing else from your account.</p>
<p><strong>Translation.</strong> Question text is sent to Cloudflare Workers AI to be translated. No personal data goes with it.</p>
<p><strong>Retention.</strong> Questions go when the room is deleted; account details go when the account is removed.${asking}</p>
<p><strong>No tracking.</strong> There are no analytics, advertising or third-party cookies.</p>
<p><a href="/">Back</a></p>
</body>
</html>
`;
}
