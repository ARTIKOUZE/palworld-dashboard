# Palworld Dashboard

A small web app to monitor and administrate a **Palworld** dedicated server (Steam dedicated server). Node + Express backend, vanilla HTML/JS frontend — a single repo, `npm install && npm start`, and it runs.

## Features (v1)

- 🔐 **Login** with a password (session cookie)
- 📊 **Dashboard**: FPS, uptime, frame time, connected players with level, position and ping (refreshed every 5 s)
- ⚡ **Actions**: start the server, in-game announcement, kick, world save, scheduled shutdown
- ⚙️ **Config editor**: reads `PalWorldSettings.ini` → typed, filterable form (119 keys) → safe rewrite → server process restart
- 🌍 **Bilingual**: every `.ini` key has a human-readable name and description in both French and English ([public/settings-meta.js](public/settings-meta.js)), with an FR/EN switch at the top of the app; the filter also searches translated names and descriptions

## Requirements

- Node.js ≥ 18
- A Palworld dedicated server with the REST API enabled in `PalWorldSettings.ini`:
  ```
  RESTAPIEnabled=True,RESTAPIPort=8212,AdminPassword="your-password"
  ```

## Installation

```bash
npm install
cp .env.example .env   # then fill in the values
npm start
```

The dashboard is available at `http://localhost:3000`.

| Variable | Purpose |
|---|---|
| `DASHBOARD_PASSWORD` | Password to log into the dashboard |
| `PALWORLD_ADMIN_PASSWORD` | The server's `AdminPassword` (REST API Basic auth) |
| `PALWORLD_INI_PATH` | Absolute path to `PalWorldSettings.ini` |
| `PALWORLD_RESTART_CMD` | Restart command (see below) |

## Restarting the server (`PALWORLD_RESTART_CMD`)

When the `.ini` is written, the server must be **relaunched** to pick up the changes. Stopping is done cleanly through the REST API (`save` then `shutdown`) — but the API cannot *restart* a dead process. `PALWORLD_RESTART_CMD` is the shell command the dashboard runs after writing the file to bring the server process back up:

- **Linux with a systemd service**: `systemctl restart palworld`
- **Docker**: `docker restart palworld`
- **Steam server on Windows, dashboard on WSL**: `bash scripts/restart-palserver.sh` — the script uses WSL interop (`cmd.exe /C start`) to relaunch `PalServer.exe` on the Windows side as a detached process.

Full sequence of `POST /api/config`: `save` → `shutdown` through the API → wait for the stop → write the `.ini` → run `PALWORLD_RESTART_CMD`.

The same command powers the **Start server** button (`POST /api/actions/start`), guarded by a liveness check so a running server can never be launched twice.

## WSL case: dashboard on WSL, Steam server on Windows

Two subtleties handled by the project:

- **Networking**: from WSL, `127.0.0.1` does not point to Windows. Set `PALWORLD_HOST=auto`: the Windows host IP (WSL's default gateway, which changes on every reboot) is detected automatically.
- **Path to the .ini**: use the mounted path, e.g. `/mnt/c/Program Files (x86)/Steam/steamapps/common/PalServer/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini`.

Good to know: the `PalWorldSettings.ini` of a freshly installed server is **empty**. You must copy the `OptionSettings=(...)` line from `DefaultPalWorldSettings.ini` (at the root of `PalServer/`), set `RESTAPIEnabled=True` and define `AdminPassword`, otherwise the REST API will not start.

## Hosting online (access for friends)

The dashboard must run **on the same machine as the Palworld server**: it reads the `.ini` from disk and talks to the REST API locally. So it is not hosted on a remote server — instead the local port is **exposed** through an HTTPS tunnel:

```bash
./scripts/start-online.sh
```

The script starts the dashboard, then a Cloudflare tunnel (`cloudflared`, installed automatically on first run, no account needed) and prints a public `https://xxx.trycloudflare.com` URL to share along with the dashboard password.

Limits and alternatives:

- The URL **changes on every launch** of the script. For a stable free URL: an [ngrok](https://ngrok.com) account (1 static domain included: `ngrok http --domain=your-domain.ngrok-free.app 3000`) or a named Cloudflare tunnel (requires an account + a domain).
- The dashboard stays online as long as the PC and the script are running.
- The URL is public: use a long `DASHBOARD_PASSWORD`, it is the only barrier.

## The `PalWorldSettings.ini` parser

This is the most interesting part of the project. Palworld's config file has an unusual shape: all ~119 options live on **a single line**, inside parentheses:

```ini
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,...,ServerName="My server",...)
```

Four traps make a naive parser unusable:

1. **You cannot `split(',')`.** Quoted values may contain commas (`ServerDescription="Welcome, have fun"`). Splitting is done character by character, tracking the open/closed state of quotes ([src/iniParser.js](src/iniParser.js), `splitPairs`).

2. **Some values are nested parenthesized lists.** `CrossplayPlatforms=(Steam,Xbox,PS5,Mac)` contains commas AND parentheses: the splitter also tracks parenthesis depth, otherwise the pair explodes into four pieces.

3. **Curly quotes break the server.** Copy-pasting from a rich text editor introduces typographic `“ ”` quotes that the server silently rejects (it falls back to default values). The parser normalizes `“ ” „ ‘ ’` into straight quotes on read **and** on write.

4. **The server overwrites the file on shutdown.** Writing the `.ini` while the server is running is pointless: it rewrites its config at shutdown. The correct order is: `save` → `shutdown` through the REST API → wait for the stop → write the file → relaunch the process. This is exactly what `POST /api/config` does.

On rewrite, unmodified keys keep their **original raw value** (no parse→format round-trip that would turn `1.000000` into `1`), key order is preserved, and a `.bak` copy is created before every write. Result: a minimal diff and syntax that never breaks. Typing (`float` → `toFixed(6)`, `boolean` → `True`/`False`, `string` → re-injected quotes) is inferred from the original value and covered by tests:

```bash
npm test
```

## Internal API

| Route | Description |
|---|---|
| `POST /api/login` / `POST /api/logout` | Session |
| `GET /api/status` | Aggregates `/info`, `/metrics`, `/players` from the Palworld API |
| `POST /api/actions/start` | Starts the server process (409 if already running) |
| `POST /api/actions/{announce,kick,save,shutdown}` | Server actions |
| `GET /api/config` | The parsed `.ini` as typed entries |
| `POST /api/config` | Writes the changes, optionally restarts |

## License

MIT
