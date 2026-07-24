# Palworld Dashboard

Petite application web de visualisation et d'administration pour serveur dédié **Palworld** (Steam dedicated server). Node + Express côté backend, HTML/JS vanilla côté front — un seul repo, `npm install && npm start`, et ça tourne.

## Fonctionnalités (v1)

- 🔐 **Login** par mot de passe (session cookie)
- 📊 **Dashboard** : FPS, uptime, frame time, joueurs connectés avec niveau, position et ping (rafraîchi toutes les 5 s)
- ⚡ **Actions** : annonce en jeu, kick, sauvegarde du monde, arrêt programmé
- ⚙️ **Éditeur de config** : lecture de `PalWorldSettings.ini` → formulaire typé et filtrable (~119 clés) → réécriture sûre → redémarrage du processus serveur

## Prérequis

- Node.js ≥ 18
- Un serveur dédié Palworld avec l'API REST activée dans `PalWorldSettings.ini` :
  ```
  RESTAPIEnabled=True,RESTAPIPort=8212,AdminPassword="votre-mot-de-passe"
  ```

## Installation

```bash
npm install
cp .env.example .env   # puis remplir les valeurs
npm start
```

Le dashboard est disponible sur `http://localhost:3000`.

| Variable | Rôle |
|---|---|
| `DASHBOARD_PASSWORD` | Mot de passe de connexion au dashboard |
| `PALWORLD_ADMIN_PASSWORD` | L'`AdminPassword` du serveur (auth Basic de l'API REST) |
| `PALWORLD_INI_PATH` | Chemin absolu vers `PalWorldSettings.ini` |
| `PALWORLD_RESTART_CMD` | Commande de redémarrage (voir ci-dessous) |

## Le redémarrage du serveur (`PALWORLD_RESTART_CMD`)

Quand on écrit le `.ini`, le serveur doit être **relancé** pour prendre en compte les changements. L'arrêt se fait proprement via l'API REST (`save` puis `shutdown`) — mais l'API ne sait pas *redémarrer* un processus mort. `PALWORLD_RESTART_CMD` est donc la commande shell que le dashboard exécute après avoir écrit le fichier, pour relancer le processus serveur :

- **Linux avec service systemd** : `systemctl restart palworld`
- **Docker** : `docker restart palworld`
- **Serveur Steam sous Windows, dashboard sous WSL** : `bash scripts/restart-palserver.sh` — le script utilise l'interop WSL (`cmd.exe /C start`) pour relancer `PalServer.exe` côté Windows en processus détaché.

Séquence complète de `POST /api/config` : `save` → `shutdown` via l'API → attente de l'arrêt → écriture du `.ini` → exécution de `PALWORLD_RESTART_CMD`.

## Cas WSL : dashboard sous WSL, serveur Steam sous Windows

Deux subtilités gérées par le projet :

- **Réseau** : depuis WSL, `127.0.0.1` ne pointe pas vers Windows. Mettre `PALWORLD_HOST=auto` : l'IP de l'hôte Windows (la passerelle par défaut de WSL, qui change à chaque reboot) est détectée automatiquement.
- **Chemin du .ini** : utiliser le chemin monté, ex. `/mnt/c/Program Files (x86)/Steam/steamapps/common/PalServer/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini`.

À savoir : le `PalWorldSettings.ini` d'un serveur fraîchement installé est **vide**. Il faut y recopier la ligne `OptionSettings=(...)` depuis `DefaultPalWorldSettings.ini` (à la racine de `PalServer/`) et y activer `RESTAPIEnabled=True` + définir `AdminPassword`, sinon l'API REST ne démarre pas.

## Hébergement en ligne (accès pour les amis)

Le dashboard doit tourner **sur la même machine que le serveur Palworld** : il lit le `.ini` sur le disque et parle à l'API REST en local. On ne l'héberge donc pas sur un serveur distant — on **expose** le port local via un tunnel HTTPS :

```bash
./scripts/start-online.sh
```

Le script lance le dashboard puis un tunnel Cloudflare (`cloudflared`, installé automatiquement au premier lancement, sans compte) et affiche une URL publique `https://xxx.trycloudflare.com` à partager avec le mot de passe du dashboard.

Limites et alternatives :

- L'URL **change à chaque lancement** du script. Pour une URL stable et gratuite : un compte [ngrok](https://ngrok.com) (1 domaine statique offert : `ngrok http --domain=ton-domaine.ngrok-free.app 3000`) ou un tunnel Cloudflare nommé (nécessite un compte + un domaine).
- Le dashboard est en ligne tant que le PC et le script tournent.
- L'URL est publique : mets un `DASHBOARD_PASSWORD` long, c'est la seule barrière.

## Le parseur de `PalWorldSettings.ini`

C'est le morceau le plus intéressant du projet. Le fichier de config de Palworld a une forme inhabituelle : les ~119 options vivent sur **une seule ligne**, entre parenthèses :

```ini
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,...,ServerName="Mon serveur",...)
```

Trois pièges rendent un parseur naïf inutilisable :

1. **On ne peut pas `split(',')`.** Les valeurs entre guillemets peuvent contenir des virgules (`ServerDescription="Bienvenue, amusez-vous"`). Le découpage se fait caractère par caractère en suivant l'état ouvert/fermé des guillemets ([src/iniParser.js](src/iniParser.js), `splitPairs`).

2. **Certaines valeurs sont des listes entre parenthèses imbriquées.** `CrossplayPlatforms=(Steam,Xbox,PS5,Mac)` contient des virgules ET des parenthèses : le découpage suit aussi la profondeur de parenthèses, sinon la paire explose en quatre morceaux.

3. **Les guillemets courbes cassent le serveur.** Un copier-coller depuis un éditeur de texte riche introduit des `“ ”` typographiques que le serveur refuse silencieusement (il retombe sur les valeurs par défaut). Le parseur normalise `“ ” „ ‘ ’` en guillemets droits à la lecture **et** à l'écriture.

4. **Le serveur écrase le fichier à l'arrêt.** Écrire le `.ini` pendant que le serveur tourne est inutile : il réécrit sa config au shutdown. L'ordre correct est donc : `save` → `shutdown` via l'API REST → attendre l'arrêt → écrire le fichier → relancer le processus. C'est exactement ce que fait la route `POST /api/config`.

À la réécriture, les clés non modifiées conservent leur **valeur brute d'origine** (pas de round-trip parse→format qui changerait `1.000000` en `1`), l'ordre des clés est préservé, et une copie `.bak` est créée avant chaque écriture. Résultat : un diff minimal et une syntaxe jamais cassée. Le typage (`float` → `toFixed(6)`, `boolean` → `True`/`False`, `string` → guillemets réinjectés) est inféré depuis la valeur d'origine et couvert par des tests :

```bash
npm test
```

## API interne

| Route | Description |
|---|---|
| `POST /api/login` / `POST /api/logout` | Session |
| `GET /api/status` | Agrège `/info`, `/metrics`, `/players` de l'API Palworld |
| `POST /api/actions/{announce,kick,save,shutdown}` | Actions serveur |
| `GET /api/config` | Le `.ini` parsé en entrées typées |
| `POST /api/config` | Écrit les modifications, redémarre optionnellement |

## Licence

MIT
