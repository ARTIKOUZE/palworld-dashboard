#!/usr/bin/env bash
# Starts the dashboard + a Cloudflare tunnel to make it reachable online.
#
# The dashboard must run on the same machine as the Palworld server (it reads
# the .ini and talks to the REST API locally): it cannot be hosted elsewhere.
# The tunnel exposes the local port over HTTPS with a public URL
# https://xxx.trycloudflare.com — no account, no port forwarding.
# The URL changes on every launch: share it with your friends along with the
# dashboard password.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared not found — installing into ~/.local/bin…"
  mkdir -p ~/.local/bin
  curl -fsSL -o ~/.local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x ~/.local/bin/cloudflared
  export PATH="$HOME/.local/bin:$PATH"
fi

node server.js &
NODE_PID=$!
trap 'kill $NODE_PID 2>/dev/null' EXIT

sleep 1
echo
echo "=== Creating the tunnel — the public URL will appear below ==="
echo
cloudflared tunnel --url "http://localhost:${PORT:-3000}"
