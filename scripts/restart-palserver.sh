#!/usr/bin/env bash
# Relaunches PalServer.exe on the Windows side from WSL.
#
# Used by PALWORLD_RESTART_CMD: the dashboard first stops the server cleanly
# through the REST API (save + shutdown), writes the .ini, then runs this
# script to bring the server process back up.
#
# "start" detaches the process so PalServer survives the end of the script;
# cmd.exe is launched from C:\ to avoid the UNC warning on WSL paths.

set -euo pipefail

PALSERVER_DIR='C:\Program Files (x86)\Steam\steamapps\common\PalServer'

cd /mnt/c
exec /mnt/c/Windows/System32/cmd.exe /C start "" /D "$PALSERVER_DIR" PalServer.exe
