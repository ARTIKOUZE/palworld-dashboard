#!/usr/bin/env bash
# Relance PalServer.exe côté Windows depuis WSL.
#
# Utilisé par PALWORLD_RESTART_CMD : le dashboard arrête d'abord proprement le
# serveur via l'API REST (save + shutdown), écrit le .ini, puis exécute ce
# script pour relancer le processus.
#
# "start" détache le processus pour que PalServer survive à la fin du script ;
# cmd.exe est lancé depuis C:\ pour éviter l'avertissement UNC des chemins WSL.

set -euo pipefail

PALSERVER_DIR='C:\Program Files (x86)\Steam\steamapps\common\PalServer'

cd /mnt/c
exec /mnt/c/Windows/System32/cmd.exe /C start "" /D "$PALSERVER_DIR" PalServer.exe
