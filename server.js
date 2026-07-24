'use strict';

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const express = require('express');
const session = require('express-session');

const api = require('./src/palworldApi');
const ini = require('./src/iniParser');

const app = express();
const PORT = process.env.PORT || 3000;
const INI_PATH = process.env.PALWORLD_INI_PATH;
const RESTART_CMD = process.env.PALWORLD_RESTART_CMD;

if (!process.env.DASHBOARD_PASSWORD) {
  console.error('DASHBOARD_PASSWORD manquant : copie .env.example vers .env et remplis-le.');
  process.exit(1);
}

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth -------------------------------------------------------------------

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Non authentifié' });
}

app.post('/api/login', (req, res) => {
  if (req.body.password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Mot de passe incorrect' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated) });
});

// --- Dashboard --------------------------------------------------------------

app.get('/api/status', requireAuth, async (req, res) => {
  try {
    const [info, metrics, players] = await Promise.all([
      api.info(),
      api.metrics(),
      api.players(),
    ]);
    res.json({ online: true, info, metrics, players: players.players || [] });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// --- Actions ----------------------------------------------------------------

app.post('/api/actions/announce', requireAuth, async (req, res) => {
  try {
    await api.announce(req.body.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/actions/kick', requireAuth, async (req, res) => {
  try {
    await api.kick(req.body.userid, req.body.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/actions/save', requireAuth, async (req, res) => {
  try {
    await api.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/actions/shutdown', requireAuth, async (req, res) => {
  try {
    await api.shutdown(req.body.waittime, req.body.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Éditeur de config ------------------------------------------------------

app.get('/api/config', requireAuth, async (req, res) => {
  if (!INI_PATH) return res.status(500).json({ error: 'PALWORLD_INI_PATH non configuré' });
  try {
    const content = await fs.readFile(INI_PATH, 'utf8');
    const parsed = ini.parse(content);
    res.json({
      entries: parsed.entries.map(({ key, value, type }) => ({ key, value, type })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', requireAuth, async (req, res) => {
  if (!INI_PATH) return res.status(500).json({ error: 'PALWORLD_INI_PATH non configuré' });
  try {
    const content = await fs.readFile(INI_PATH, 'utf8');
    const parsed = ini.parse(content);
    const output = ini.serialize(parsed, req.body.changes || {});

    // Sauvegarde du monde puis arrêt AVANT d'écrire : le serveur réécrit le
    // .ini quand il s'arrête, ce qui écraserait nos modifications.
    if (req.body.restart) {
      try {
        await api.save();
        await api.shutdown(10, 'Config update, restarting');
      } catch {
        // serveur déjà arrêté : on écrit quand même
      }
      await new Promise((r) => setTimeout(r, 15000));
    }

    await fs.copyFile(INI_PATH, `${INI_PATH}.bak`);
    await fs.writeFile(INI_PATH, output, 'utf8');

    if (req.body.restart && RESTART_CMD) {
      exec(RESTART_CMD, (err) => {
        if (err) console.error('Échec du redémarrage :', err.message);
      });
    }
    res.json({ ok: true, restarted: Boolean(req.body.restart && RESTART_CMD) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Palworld dashboard → http://localhost:${PORT}`);
});
