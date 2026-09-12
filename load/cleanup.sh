#!/usr/bin/env sh
set -eu

# Empties rooms a load run left behind. Names have to be passed in: getByName
# hashes them, so the API knows only opaque ids and can list nothing back.

: "${BASE_URL:?set BASE_URL to the deployed worker}"

if [ "$#" -eq 0 ]; then
	printf 'usage: %s <room>...\n' "$0" >&2
	exit 1
fi

failed=''
for room in "$@"; do
	# `|| true` so one unreachable room does not abort the rest under set -e.
	code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
		"${BASE_URL}/api/rooms/${room}" || true)
	printf '%-20s %s\n' "$room" "$code"
	[ "$code" = '200' ] || failed="$failed $room"
done

if [ -n "$failed" ]; then
	printf 'not emptied:%s\n' "$failed" >&2
	exit 1
fi
