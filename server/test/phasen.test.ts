// Migration der Bestandslagen: Phasen (Spec v6) und Rollen/Gerätekennung (Spec v7).
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { STANDARD_STATUS, type Lage } from '../../shared/protocol.ts';
import { mitPhasen, oeffneDb } from '../src/db.ts';

const alt = (beendetAm: number | null) => ({ id: 'L', name: 'Alt', statusSet: STANDARD_STATUS, erstelltAm: 100, beendetAm }) as unknown as Lage;

it('mitPhasen: offen → LV seit Erstellung, beendet → LV bis zum Beenden, dann AN; Lage mit Phasen bleibt', () => {
  expect(mitPhasen(alt(null))).toEqual({ id: 'L', name: 'Alt', statusSet: STANDARD_STATUS, erstelltAm: 100, phasen: [{ phase: 'lv', t: 100 }] });
  expect(mitPhasen(alt(900)).phasen).toEqual([{ phase: 'lv', t: 100 }, { phase: 'an', t: 900 }]);
  const l = { ...alt(null), phasen: [{ phase: 'ap' as const, t: 5 }] };
  expect(mitPhasen(l)).toBe(l);
});

it('Bestands-DB (vor Spec v7): Spalten nachgerüstet; mehrere Leitungen → die zuerst beigetretene aktive bleibt, die übrigen werden Gruppenführer; Leitungs-Code gilt als Gruppenführer-Code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lagebild-alt-'));
  const pfad = join(dir, 'alt.sqlite');
  const roh = new DatabaseSync(pfad);
  roh.exec(`CREATE TABLE lage (id TEXT PRIMARY KEY, daten TEXT NOT NULL, tn_code_hash TEXT NOT NULL UNIQUE, ltg_code_hash TEXT NOT NULL UNIQUE);
    CREATE TABLE teilnehmer (id TEXT PRIMARY KEY, lage_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, daten TEXT NOT NULL, entfernt INTEGER NOT NULL DEFAULT 0);`);
  roh.prepare('INSERT INTO lage VALUES (?, ?, ?, ?)').run('L', JSON.stringify(alt(null)), 'tn', 'ltg');
  const tn = roh.prepare('INSERT INTO teilnehmer (id, lage_id, token_hash, daten, entfernt) VALUES (?, ?, ?, ?, ?)');
  // entfernte Leitung zuerst: sie zählt nicht
  for (const [id, rolle, entfernt] of [['weg', 'leitung', 1], ['erste', 'leitung', 0], ['tn', 'teilnehmer', 0], ['zweite', 'leitung', 0]] as const)
    tn.run(id, 'L', `t-${id}`, JSON.stringify({ id, rolle }), entfernt);
  roh.close();
  const db = oeffneDb(pfad);
  try {
    expect(db.teilnehmerListe('L', true).map((t) => [t.id, t.rolle])).toEqual([['weg', 'gruppenfuehrer'], ['erste', 'leitung'], ['tn', 'teilnehmer'], ['zweite', 'gruppenfuehrer']]);
    expect(db.lageNachCodeHash('ltg')?.rolle).toBe('gruppenfuehrer');
    expect(db.teilnehmerNachGeraet('L', 'X')).toBeUndefined(); // Altbestand ohne Kennung
  } finally {
    db.schliessen();
    rmSync(dir, { recursive: true, force: true });
  }
});
