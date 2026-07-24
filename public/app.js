'use strict';

const $ = (sel) => document.querySelector(sel);

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

function renderConfig(filter = '') {
  const container = $('#config-form');
  container.innerHTML = '';
  const query = filter.toLowerCase();
  for (const entry of configEntries) {
    if (query && !entry.key.toLowerCase().includes(query)) continue;
    const row = document.createElement('div');
    row.className = 'config-row';
    const changed = entry.key in configChanges ? ' changed' : '';
    let input;
    if (entry.type === 'boolean') {
      const current = entry.key in configChanges ? configChanges[entry.key] : entry.value;
      input = `<select data-key="${entry.key}">
        <option value="True" ${current === true || current === 'True' ? 'selected' : ''}>True</option>
        <option value="False" ${current === false || current === 'False' ? 'selected' : ''}>False</option>
      </select>`;
    } else {
      const current = entry.key in configChanges ? configChanges[entry.key] : entry.value;
      const inputType = entry.type === 'float' || entry.type === 'integer' ? 'number' : 'text';
      const step = entry.type === 'float' ? ' step="any"' : '';
      input = `<input type="${inputType}"${step} data-key="${entry.key}" value="${String(current).replace(/"/g, '&quot;')}" />`;
    }
    row.innerHTML = `<label class="config-key${changed}">${entry.key}<span class="type-tag">${entry.type}</span></label>${input}`;
    container.appendChild(row);
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
