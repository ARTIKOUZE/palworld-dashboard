#!/usr/bin/env bash
# Lance le dashboard + un tunnel Cloudflare pour le rendre accessible en ligne.
#
# Le dashboard doit tourner sur la même machine que le serveur Palworld (il lit
# le .ini et parle à l'API REST en local) : on ne peut pas l'héberger ailleurs.
# Le tunnel expose donc le port local en HTTPS avec une URL publique
# https://xxx.trycloudflare.com — sans compte, sans ouverture de port.
# L'URL change à chaque lancement : partage-la à tes amis avec le mot de passe.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared introuvable — installation dans ~/.local/bin…"
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
echo "=== Tunnel en cours de création — l'URL publique s'affiche ci-dessous ==="
echo
cloudflared tunnel --url "http://localhost:${PORT:-3000}"
