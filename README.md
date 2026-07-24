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
| `PALWORLD_RESTART_CMD` | Commande de redémarrage (ex : `systemctl restart palworld`) |

## Le parseur de `PalWorldSettings.ini`

C'est le morceau le plus intéressant du projet. Le fichier de config de Palworld a une forme inhabituelle : les ~119 options vivent sur **une seule ligne**, entre parenthèses :

```ini
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,...,ServerName="Mon serveur",...)
```

Trois pièges rendent un parseur naïf inutilisable :

1. **On ne peut pas `split(',')`.** Les valeurs entre guillemets peuvent contenir des virgules (`ServerDescription="Bienvenue, amusez-vous"`). Le découpage se fait caractère par caractère en suivant l'état ouvert/fermé des guillemets ([src/iniParser.js](src/iniParser.js), `splitPairs`).

2. **Les guillemets courbes cassent le serveur.** Un copier-coller depuis un éditeur de texte riche introduit des `“ ”` typographiques que le serveur refuse silencieusement (il retombe sur les valeurs par défaut). Le parseur normalise `“ ” „ ‘ ’` en guillemets droits à la lecture **et** à l'écriture.

3. **Le serveur écrase le fichier à l'arrêt.** Écrire le `.ini` pendant que le serveur tourne est inutile : il réécrit sa config au shutdown. L'ordre correct est donc : `save` → `shutdown` via l'API REST → attendre l'arrêt → écrire le fichier → relancer le processus. C'est exactement ce que fait la route `POST /api/config`.

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
