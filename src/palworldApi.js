'use strict';

/**
 * Client pour l'API REST officielle du serveur dédié Palworld.
 * Nécessite dans PalWorldSettings.ini : RESTAPIEnabled=True, RESTAPIPort=8212
 * Auth : Basic avec l'utilisateur "admin" et l'AdminPassword du serveur.
 * Doc : https://tech.palworldgame.com/api/rest-api/palwold-rest-api/
 */

let cachedHost;

/**
 * PALWORLD_HOST=auto : le dashboard tourne sous WSL et le serveur Palworld
 * sous Windows. L'hôte Windows est la passerelle par défaut de WSL, dont
 * l'IP change à chaque redémarrage — on la résout au premier appel.
 */
function resolveHost() {
  const configured = process.env.PALWORLD_HOST || '127.0.0.1';
  if (configured !== 'auto') return configured;
  if (!cachedHost) {
    cachedHost = require('child_process')
      .execSync("ip route show default | awk '{print $3}'")
      .toString()
      .trim();
  }
  return cachedHost;
}

const BASE = () =>
  `http://${resolveHost()}:${process.env.PALWORLD_API_PORT || 8212}/v1/api`;

function authHeader() {
  const token = Buffer.from(`admin:${process.env.PALWORLD_ADMIN_PASSWORD || ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: {
      ...authHeader(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`API Palworld ${method} ${path} → HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

module.exports = {
  info: () => request('/info'),
  metrics: () => request('/metrics'),
  players: () => request('/players'),
  settings: () => request('/settings'),
  announce: (message) => request('/announce', { method: 'POST', body: { message } }),
  kick: (userid, message = 'Kicked by admin') =>
    request('/kick', { method: 'POST', body: { userid, message } }),
  ban: (userid, message = 'Banned by admin') =>
    request('/ban', { method: 'POST', body: { userid, message } }),
  save: () => request('/save', { method: 'POST' }),
  shutdown: (waittime = 30, message = 'Server restarting soon') =>
    request('/shutdown', { method: 'POST', body: { waittime, message } }),
};
