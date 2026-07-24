'use strict';

/**
 * Parseur / sérialiseur pour PalWorldSettings.ini
 *
 * Le fichier a la forme :
 *
 *   [/Script/Pal.PalGameWorldSettings]
 *   OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,...,ServerName="Mon serveur",...)
 *
 * Toutes les options (~119 clés) vivent sur UNE SEULE ligne, entre parenthèses.
 * Pièges connus :
 *  - des virgules peuvent apparaître DANS les valeurs entre guillemets
 *    (ServerDescription="Bienvenue, amusez-vous") : on ne peut pas split(',')
 *  - les guillemets courbes (“ ” ‘ ’) introduits par copier-coller depuis un
 *    éditeur de texte riche cassent le chargement côté serveur : on les
 *    normalise en guillemets droits
 *  - certaines valeurs sont des listes entre parenthèses imbriquées
 *    (CrossplayPlatforms=(Steam,Xbox,PS5,Mac)) : leurs virgules non plus ne
 *    séparent pas deux paires
 *  - le serveur réécrit le fichier à l'arrêt : il faut écrire PUIS redémarrer,
 *    jamais l'inverse
 */

const SECTION_HEADER = '[/Script/Pal.PalGameWorldSettings]';
const OPTION_PREFIX = 'OptionSettings=';

/** Remplace les guillemets typographiques par des guillemets droits. */
function normalizeQuotes(text) {
  return text
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’‚′]/g, "'");
}

/**
 * Découpe le contenu entre parenthèses en paires clé/valeur, en respectant
 * les guillemets et les parenthèses imbriquées : une virgule entre guillemets
 * ou à l'intérieur d'une liste (Steam,Xbox,...) ne sépare pas deux paires.
 */
function splitPairs(body) {
  const pairs = [];
  let current = '';
  let inQuotes = false;
  let depth = 0;
  for (const ch of body) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && ch === '(') {
      depth += 1;
      current += ch;
    } else if (!inQuotes && ch === ')') {
      depth -= 1;
      current += ch;
    } else if (ch === ',' && !inQuotes && depth === 0) {
      pairs.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') pairs.push(current);
  return pairs;
}

/** Devine le type d'une valeur brute pour typer le formulaire côté front. */
function inferType(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) return 'string';
  if (raw.startsWith('(') && raw.endsWith(')')) return 'list'; // (Steam,Xbox,PS5,Mac)
  if (raw === 'True' || raw === 'False') return 'boolean';
  if (/^-?\d+\.\d+$/.test(raw)) return 'float';
  if (/^-?\d+$/.test(raw)) return 'integer';
  return 'enum'; // valeurs nues type Difficulty=None, DeathPenalty=All
}

/**
 * Parse le contenu complet d'un PalWorldSettings.ini.
 * Retourne { entries, header } où entries est une liste ordonnée de
 * { key, value, raw, type } — l'ordre d'origine est préservé pour que la
 * réécriture produise un diff minimal.
 */
function parse(content) {
  const normalized = normalizeQuotes(content);
  const line = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(OPTION_PREFIX));

  if (!line) {
    throw new Error(`Ligne "${OPTION_PREFIX}(...)" introuvable dans le fichier`);
  }

  const open = line.indexOf('(');
  const close = line.lastIndexOf(')');
  if (open === -1 || close === -1 || close < open) {
    throw new Error('Parenthèses OptionSettings malformées');
  }

  const body = line.slice(open + 1, close);
  const entries = splitPairs(body).map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      throw new Error(`Paire sans "=" : "${pair}"`);
    }
    const key = pair.slice(0, eq).trim();
    const raw = pair.slice(eq + 1).trim();
    const type = inferType(raw);
    const value =
      type === 'string' ? raw.slice(1, -1)
      : type === 'boolean' ? raw === 'True'
      : type === 'float' ? parseFloat(raw)
      : type === 'integer' ? parseInt(raw, 10)
      : raw;
    return { key, value, raw, type };
  });

  return { entries };
}

/** Formate une valeur JS vers la syntaxe attendue par le serveur. */
function formatValue(entry, newValue) {
  switch (entry.type) {
    case 'string': {
      const clean = normalizeQuotes(String(newValue)).replace(/"/g, '');
      return `"${clean}"`;
    }
    case 'boolean':
      return newValue === true || newValue === 'true' || newValue === 'True'
        ? 'True'
        : 'False';
    case 'float': {
      const num = Number(newValue);
      if (Number.isNaN(num)) throw new Error(`Valeur non numérique pour ${entry.key}`);
      return num.toFixed(6);
    }
    case 'integer': {
      const num = parseInt(newValue, 10);
      if (Number.isNaN(num)) throw new Error(`Valeur non entière pour ${entry.key}`);
      return String(num);
    }
    default:
      return String(newValue);
  }
}

/**
 * Reconstruit le fichier complet à partir des entrées parsées et d'un objet
 * { clé: nouvelleValeur } de modifications. Les clés non modifiées gardent
 * leur valeur brute d'origine, l'ordre est conservé.
 */
function serialize(parsed, changes = {}) {
  const parts = parsed.entries.map((entry) => {
    const raw = Object.prototype.hasOwnProperty.call(changes, entry.key)
      ? formatValue(entry, changes[entry.key])
      : entry.raw;
    return `${entry.key}=${raw}`;
  });
  return `${SECTION_HEADER}\n${OPTION_PREFIX}(${parts.join(',')})\n`;
}

module.exports = { parse, serialize, normalizeQuotes, inferType };
