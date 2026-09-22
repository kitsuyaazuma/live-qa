#!/usr/bin/env sh
set -eu

for name in "$@"; do
	if [ -n "$(printenv "$name" || true)" ]; then
		continue
	fi

	printf '\n  %s is not set.\n\n' "$name" >&2
	case "$name" in
	CLOUDFLARE_ACCOUNT_ID)
		printf '    pnpm exec wrangler whoami         # the accounts this login can reach\n' >&2
		printf '    export CLOUDFLARE_ACCOUNT_ID=...  # the one you mean to deploy to\n' >&2
		;;
	SESSION_SECRET)
		printf '    export SESSION_SECRET=...             # the secret the deployment signs sessions with\n' >&2
		;;
	USER_ID)
		printf '    pnpm exec wrangler d1 execute DB --remote --command "SELECT id, email FROM users"\n' >&2
		printf '    export USER_ID=...                    # an admin account id from that list\n' >&2
		;;
	DOMAIN)
		printf '    export DOMAIN=qa.example.com      # the host the widget is shown on\n' >&2
		;;
	BASE_URL)
		printf '    pnpm run deploy                   # prints the url\n' >&2
		printf '    export BASE_URL=https://...       # that url\n' >&2
		;;
	esac
	printf '\n' >&2
	exit 1
done
