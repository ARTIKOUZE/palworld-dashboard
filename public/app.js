'use strict';

const $ = (sel) => document.querySelector(sel);

// Langue des descriptions de config : 'fr' ou 'en', mémorisée dans le navigateur
let lang = localStorage.getItem('lang') || 'fr';

/** Métadonnées d'une clé du .ini : { name, desc } dans la langue courante. */
function metaFor(key) {
  // "const SETTINGS_META" au niveau script n'est pas une propriété de window :
  // il faut tester le symbole lui-même
  const m = typeof SETTINGS_META !== 'undefined' ? SETTINGS_META[key] : null;
  if (!m) return { name: key, desc: '' };
  return lang === 'fr' ? { name: m[0], desc: m[1] } : { name: m[2], desc: m[3] };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error('Session expirée');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// --- Vues -------------------------------------------------------------------

let pollTimer = null;

function showLogin() {
  clearInterval(pollTimer);
  $('#login-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
}

function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  refreshStatus();
  pollTimer = setInterval(refreshStatus, 5000);
  loadConfig();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/login', { method: 'POST', body: { password: $('#login-password').value } });
    $('#login-error').classList.add('hidden');
    showApp();
  } catch {
    $('#login-error').classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  showLogin();
});

document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.classList.toggle('active', btn.dataset.lang === lang);
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    localStorage.setItem('lang', lang);
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
    renderConfig($('#config-filter').value);
  });
});

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['dashboard', 'actions', 'config'].forEach((tab) => {
      $(`#tab-${tab}`).classList.toggle('hidden', tab !== btn.dataset.tab);
    });
  });
});

// --- Dashboard --------------------------------------------------------------

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function refreshStatus() {
  try {
    const data = await api('/api/status');
    const badge = $('#server-status');
    setOnlineUI(data.online);
    if (!data.online) {
      badge.textContent = '● Hors ligne';
      badge.className = 'badge offline';
      return;
    }
    badge.textContent = `● ${data.info.servername || 'En ligne'}`;
    badge.className = 'badge online';

    $('#stat-fps').textContent = data.metrics.serverfps ?? '—';
    $('#stat-uptime').textContent = data.metrics.uptime != null ? formatUptime(data.metrics.uptime) : '—';
    $('#stat-players').textContent = `${data.metrics.currentplayernum ?? 0} / ${data.metrics.maxplayernum ?? '—'}`;
    $('#stat-frametime').textContent =
      data.metrics.serverframetime != null ? `${data.metrics.serverframetime.toFixed(1)} ms` : '—';

    const tbody = $('#players-table tbody');
    tbody.innerHTML = '';
    for (const p of data.players) {
      const tr = document.createElement('tr');
      const pos = p.location_x != null ? `${Math.round(p.location_x)}, ${Math.round(p.location_y)}` : '—';
      tr.innerHTML = `
        <td>${p.name}</td>
        <td>${p.level ?? '—'}</td>
        <td>${pos}</td>
        <td>${p.ping != null ? Math.round(p.ping) + ' ms' : '—'}</td>
        <td><button class="kick-btn" data-userid="${p.userId || p.userid}">Kick</button></td>`;
      tbody.appendChild(tr);
    }
    $('#no-players').classList.toggle('hidden', data.players.length > 0);
    tbody.querySelectorAll('.kick-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Kicker ce joueur ?')) return;
        await api('/api/actions/kick', { method: 'POST', body: { userid: btn.dataset.userid } });
        refreshStatus();
      });
    });
  } catch (err) {
    console.error(err);
  }
}

// --- Actions ----------------------------------------------------------------

/**
 * Les actions n'ont de sens que dans un état donné : Démarrer quand le
 * serveur est éteint, tout le reste quand il est allumé.
 */
function setOnlineUI(online) {
  $('#start-server-btn').classList.toggle('hidden', online);
  $('#card-start').classList.toggle('hidden', online);
  ['#card-announce', '#card-save', '#card-shutdown'].forEach((sel) =>
    $(sel).classList.toggle('hidden', !online)
  );
}

async function startServer() {
  if (!confirm('Démarrer le serveur Palworld ?')) return;
  try {
    await api('/api/actions/start', { method: 'POST' });
    alert('Serveur en cours de démarrage — il apparaîtra en ligne dans une minute environ.');
  } catch (err) {
    alert(`Impossible de démarrer : ${err.message}`);
  }
}
$('#start-server-btn').addEventListener('click', startServer);
$('#start-btn-action').addEventListener('click', startServer);

$('#announce-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/actions/announce', { method: 'POST', body: { message: $('#announce-message').value } });
  $('#announce-message').value = '';
  alert('Annonce envoyée');
});

$('#save-btn').addEventListener('click', async () => {
  await api('/api/actions/save', { method: 'POST' });
  alert('Monde sauvegardé');
});

$('#shutdown-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const waittime = parseInt($('#shutdown-wait').value, 10);
  if (!confirm(`Arrêter le serveur dans ${waittime} secondes ?`)) return;
  await api('/api/actions/shutdown', { method: 'POST', body: { waittime, message: `Server shutdown in ${waittime}s` } });
  alert('Arrêt programmé');
});

// --- Config -----------------------------------------------------------------

let configEntries = [];
const configChanges = {};

function configRow(entry) {
  const meta = metaFor(entry.key);
  const row = document.createElement('div');
  row.className = 'config-row';
  const changed = entry.key in configChanges ? ' changed' : '';
  const current = entry.key in configChanges ? configChanges[entry.key] : entry.value;
  let input;
  if (entry.type === 'boolean') {
    input = `<select data-key="${entry.key}">
      <option value="True" ${current === true || current === 'True' ? 'selected' : ''}>True</option>
      <option value="False" ${current === false || current === 'False' ? 'selected' : ''}>False</option>
    </select>`;
  } else {
    const inputType = entry.type === 'float' || entry.type === 'integer' ? 'number' : 'text';
    const step = entry.type === 'float' ? ' step="any"' : '';
    input = `<input type="${inputType}"${step} data-key="${entry.key}" value="${String(current).replace(/"/g, '&quot;')}" />`;
  }
  // la description et la clé technique n'apparaissent qu'au survol du nom
  row.innerHTML = `
    <div class="config-label${changed}">
      <span class="config-name">${meta.name}
        <span class="tooltip">${meta.desc || ''}<code>${entry.key} · ${entry.type}</code></span>
      </span>
    </div>${input}`;
  return row;
}

function renderConfig(filter = '') {
  const container = $('#config-form');
  container.innerHTML = '';
  const query = filter.toLowerCase();
  const matches = (entry) => {
    if (!query) return true;
    const meta = metaFor(entry.key);
    return `${entry.key} ${meta.name} ${meta.desc}`.toLowerCase().includes(query);
  };

  // regroupe les entrées par catégorie, dans l'ordre défini par settings-meta.js
  const byKey = new Map(configEntries.map((e) => [e.key, e]));
  const categorized = new Set();
  const groups = (typeof SETTINGS_CATEGORIES !== 'undefined' ? SETTINGS_CATEGORIES : []).map(
    ([, labelFr, labelEn, keys]) => ({
      label: lang === 'fr' ? labelFr : labelEn,
      entries: keys.map((k) => (categorized.add(k), byKey.get(k))).filter(Boolean),
    })
  );
  const rest = configEntries.filter((e) => !categorized.has(e.key));
  if (rest.length) groups.push({ label: lang === 'fr' ? 'Autres' : 'Other', entries: rest });

  for (const group of groups) {
    const entries = group.entries.filter(matches);
    if (entries.length === 0) continue;
    const header = document.createElement('h3');
    header.className = 'config-cat';
    header.textContent = group.label;
    container.appendChild(header);
    for (const entry of entries) container.appendChild(configRow(entry));
  }

  container.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('change', () => {
      configChanges[el.dataset.key] = el.value;
      renderConfig($('#config-filter').value);
    });
  });
}

async function loadConfig() {
  try {
    const data = await api('/api/config');
    configEntries = data.entries;
    $('#config-status').textContent = `${configEntries.length} clés chargées`;
    renderConfig();
  } catch (err) {
    $('#config-status').textContent = `Erreur : ${err.message}`;
  }
}

$('#config-filter').addEventListener('input', (e) => renderConfig(e.target.value));

$('#config-save').addEventListener('click', async () => {
  const count = Object.keys(configChanges).length;
  if (count === 0) return alert('Aucune modification');
  const restart = $('#config-restart').checked;
  if (!confirm(`Écrire ${count} modification(s) dans le .ini${restart ? ' et redémarrer le serveur' : ''} ?`)) return;
  $('#config-status').textContent = 'Écriture en cours…';
  try {
    const res = await api('/api/config', { method: 'POST', body: { changes: configChanges, restart } });
    Object.keys(configChanges).forEach((k) => delete configChanges[k]);
    $('#config-status').textContent = res.restarted
      ? 'Config écrite, serveur en cours de redémarrage'
      : 'Config écrite';
    loadConfig();
  } catch (err) {
    $('#config-status').textContent = `Erreur : ${err.message}`;
  }
});

// --- Init -------------------------------------------------------------------

api('/api/session').then((s) => (s.authenticated ? showApp() : showLogin()));
