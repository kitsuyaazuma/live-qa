#!/usr/bin/env sh
set -eu

# on: the widget named after the worker, created for DOMAIN when there is none,
# and its two keys stored as secrets. off: the keys removed; the widget stays.

name=live-qa
json='let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {'

case "${1:-}" in
on)
	scripts/require-env.sh CLOUDFLARE_ACCOUNT_ID DOMAIN
	sitekey=$(wrangler turnstile widget list --json | node -e "$json"'
		const hit = JSON.parse(s).find((w) => w.name === process.argv[1] && w.domains.includes(process.argv[2]));
		process.stdout.write(hit ? hit.sitekey : "");
	});' "$name" "$DOMAIN")
	if [ -z "$sitekey" ]; then
		sitekey=$(wrangler turnstile widget create "$name" --domain "$DOMAIN" --mode managed --json |
			node -e "$json"' process.stdout.write(JSON.parse(s).sitekey); });')
		echo "created widget $sitekey for $DOMAIN"
	fi
	printf '%s' "$sitekey" | wrangler secret put TURNSTILE_SITE_KEY -c wrangler.jsonc
	wrangler turnstile widget get "$sitekey" --json |
		node -e "$json"' process.stdout.write(JSON.parse(s).secret); });' |
		wrangler secret put TURNSTILE_SECRET_KEY -c wrangler.jsonc
	;;
off)
	scripts/require-env.sh CLOUDFLARE_ACCOUNT_ID
	for key in TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY; do
		wrangler secret delete "$key" -c wrangler.jsonc
	done
	;;
*)
	printf 'usage: %s on|off\n' "$0" >&2
	exit 1
	;;
esac
