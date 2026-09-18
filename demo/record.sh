#!/usr/bin/env sh
set -eu

# Records the readme tour into demo/out. Translation reaches the real Workers
# AI, so `wrangler login` first.

PORT="${PORT:-8080}"
ROOM="${ROOM:-example}"
OUT=demo/out
BASE="http://localhost:$PORT"

[ -f .dev.vars ] || cp demo/dev.vars .dev.vars
SESSION_SECRET=$(sed -n 's/^SESSION_SECRET="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .dev.vars)
ADMIN_EMAIL=$(sed -n 's/^ADMIN_EMAILS="\{0,1\}\([^",]*\).*/\1/p' .dev.vars)
if [ -z "$ADMIN_EMAIL" ]; then
	echo 'ADMIN_EMAILS in .dev.vars is empty, and only an admin can create the room' >&2
	exit 1
fi

pnpm run migrate
pnpm exec wrangler d1 execute DB --local --file demo/seed.sql
pnpm exec wrangler d1 execute DB --local --command "UPDATE users SET email = '$ADMIN_EMAIL' WHERE id = 'demo-host'"
pnpm exec playwright install chromium

mkdir -p "$OUT"
if ! curl -sf "$BASE/api/rooms/scratch-probe" >/dev/null; then
	node_modules/.bin/vite dev --port "$PORT" >"$OUT/dev.log" 2>&1 &
	server=$!
	trap 'kill $server 2>/dev/null' EXIT
	for _ in $(seq 90); do
		curl -sf "$BASE/api/rooms/scratch-probe" >/dev/null && break
		sleep 1
	done
fi

SESSION_SECRET="$SESSION_SECRET" ROOM="$ROOM" BASE_URL="$BASE" node demo/tour.mjs

ffmpeg -hide_banner -loglevel error -y -i "$OUT/tour.webm" \
	-c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/tour-1080.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$OUT/tour.webm" -vf scale=1280:720:flags=lanczos \
	-c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/tour-720.mp4"
ls -lh "$OUT/tour-1080.mp4" "$OUT/tour-720.mp4"
