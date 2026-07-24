'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parse, serialize, normalizeQuotes, inferType } = require('../src/iniParser');

const SAMPLE = `[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,ExpRate=1.000000,PalCaptureRate=1.000000,DeathPenalty=All,bEnablePlayerToPlayerDamage=False,ServerPlayerMaxNum=32,ServerName="Mon serveur, le meilleur",CrossplayPlatforms=(Steam,Xbox,PS5,Mac),ServerDescription="",AdminPassword="secret123",PublicPort=8211,RESTAPIEnabled=True,RESTAPIPort=8212)
`;

test('parse extrait toutes les paires dans l\'ordre', () => {
  const { entries } = parse(SAMPLE);
  assert.strictEqual(entries.length, 15);
  assert.strictEqual(entries[0].key, 'Difficulty');
  assert.strictEqual(entries[entries.length - 1].key, 'RESTAPIPort');
});

test('les listes imbriquées (CrossplayPlatforms) restent une seule paire', () => {
  const { entries } = parse(SAMPLE);
  const cross = entries.find((e) => e.key === 'CrossplayPlatforms');
  assert.strictEqual(cross.raw, '(Steam,Xbox,PS5,Mac)');
  assert.strictEqual(cross.type, 'list');
});

test('les virgules dans les chaînes entre guillemets ne cassent pas le découpage', () => {
  const { entries } = parse(SAMPLE);
  const name = entries.find((e) => e.key === 'ServerName');
  assert.strictEqual(name.value, 'Mon serveur, le meilleur');
  assert.strictEqual(name.type, 'string');
});

test('inférence de types', () => {
  assert.strictEqual(inferType('1.000000'), 'float');
  assert.strictEqual(inferType('32'), 'integer');
  assert.strictEqual(inferType('True'), 'boolean');
  assert.strictEqual(inferType('"abc"'), 'string');
  assert.strictEqual(inferType('None'), 'enum');
});

test('les guillemets courbes sont normalisés', () => {
  const curly = SAMPLE.replace('"secret123"', '“secret123”');
  const { entries } = parse(curly);
  const admin = entries.find((e) => e.key === 'AdminPassword');
  assert.strictEqual(admin.type, 'string');
  assert.strictEqual(admin.value, 'secret123');
  assert.strictEqual(normalizeQuotes('“a” ‘b’'), '"a" \'b\'');
});

test('serialize sans modification reproduit le fichier à l\'identique', () => {
  const parsed = parse(SAMPLE);
  assert.strictEqual(serialize(parsed), SAMPLE);
});

test('serialize applique les modifications en gardant le format', () => {
  const parsed = parse(SAMPLE);
  const out = serialize(parsed, {
    ExpRate: '2.5',
    ServerPlayerMaxNum: 16,
    bEnablePlayerToPlayerDamage: 'True',
    ServerName: 'Nouveau nom',
  });
  assert.ok(out.includes('ExpRate=2.500000'));
  assert.ok(out.includes('ServerPlayerMaxNum=16'));
  assert.ok(out.includes('bEnablePlayerToPlayerDamage=True'));
  assert.ok(out.includes('ServerName="Nouveau nom"'));
  // le reste est inchangé
  assert.ok(out.includes('DayTimeSpeedRate=1.000000'));
  // et le résultat reste re-parsable
  assert.strictEqual(parse(out).entries.length, 15);
});

test('serialize rejette une valeur numérique invalide', () => {
  const parsed = parse(SAMPLE);
  assert.throws(() => serialize(parsed, { ExpRate: 'abc' }));
});
