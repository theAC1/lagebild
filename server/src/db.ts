// SQLite-Zugriff (node:sqlite). Entitäten werden als JSON gespeichert; der Vertrag ist die Struktur.
import { DatabaseSync } from 'node:sqlite';
import { STANDARD_EBENE_NAME, standardEbeneId } from '../../shared/protocol.ts';
import type { Alarm, BloodhoundAuftrag, Chat, Ebene, Lage, Marker, Meldung, Position, Rolle, Sichtung, Spuren, Teilnehmer, Zeichnung } from '../../shared/protocol.ts';

type Eintraege = { marker: Marker; chat: Chat; sichtung: Sichtung; alarm: Alarm; meldung: Meldung; ebene: Ebene; zeichnung: Zeichnung; bloodhound: BloodhoundAuftrag };
export type Art = keyof Eintraege;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lage (
  id TEXT PRIMARY KEY, daten TEXT NOT NULL,
  tn_code_hash TEXT NOT NULL UNIQUE, ltg_code_hash TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS teilnehmer (
  id TEXT PRIMARY KEY, lage_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  daten TEXT NOT NULL, entfernt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS teilnehmer_lage ON teilnehmer(lage_id);
CREATE TABLE IF NOT EXISTS spur (lage_id TEXT NOT NULL, teilnehmer_id TEXT NOT NULL, t INTEGER NOT NULL, daten TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS spur_lage ON spur(lage_id, t);
CREATE TABLE IF NOT EXISTS eintrag (
  art TEXT NOT NULL, id TEXT NOT NULL, lage_id TEXT NOT NULL, t INTEGER NOT NULL, daten TEXT NOT NULL,
  PRIMARY KEY (art, id)
);
CREATE INDEX IF NOT EXISTS eintrag_lage ON eintrag(lage_id, art, t);
CREATE TABLE IF NOT EXISTS foto (id TEXT PRIMARY KEY, lage_id TEXT NOT NULL, ext TEXT NOT NULL, von TEXT NOT NULL, t INTEGER NOT NULL);
`;

type Zeile = Record<string, unknown>;
const json = <T>(z: Zeile | undefined): T | undefined => (z ? (JSON.parse(z.daten as string) as T) : undefined);

export function oeffneDb(pfad: string) {
  const db = new DatabaseSync(pfad);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  db.exec(SCHEMA);

  const q = {
    lageNeu: db.prepare('INSERT INTO lage (id, daten, tn_code_hash, ltg_code_hash) VALUES (?, ?, ?, ?)'),
    lage: db.prepare('SELECT daten FROM lage WHERE id = ?'),
    lageCode: db.prepare('SELECT daten, tn_code_hash = ? AS tn FROM lage WHERE tn_code_hash = ? OR ltg_code_hash = ?'),
    lageUpd: db.prepare('UPDATE lage SET daten = ? WHERE id = ?'),
    lageTnCode: db.prepare('UPDATE lage SET tn_code_hash = ? WHERE id = ?'),
    tnNeu: db.prepare('INSERT INTO teilnehmer (id, lage_id, token_hash, daten) VALUES (?, ?, ?, ?)'),
    tnToken: db.prepare('SELECT lage_id, daten FROM teilnehmer WHERE token_hash = ? AND entfernt = 0'),
    tnUpd: db.prepare('UPDATE teilnehmer SET daten = ? WHERE id = ?'),
    tnWeg: db.prepare('UPDATE teilnehmer SET entfernt = 1 WHERE id = ? AND lage_id = ?'),
    tnListe: db.prepare('SELECT daten FROM teilnehmer WHERE lage_id = ? AND entfernt = 0'),
    tnAlle: db.prepare('SELECT daten FROM teilnehmer WHERE lage_id = ?'),
    tnAktiv: db.prepare('SELECT 1 FROM teilnehmer WHERE id = ? AND lage_id = ? AND entfernt = 0'),
    spurNeu: db.prepare('INSERT INTO spur (lage_id, teilnehmer_id, t, daten) VALUES (?, ?, ?, ?)'),
    spuren: db.prepare('SELECT teilnehmer_id, daten FROM spur WHERE lage_id = ? AND t >= ? ORDER BY t'),
    eNeu: db.prepare(
      'INSERT INTO eintrag (art, id, lage_id, t, daten) VALUES (?, ?, ?, ?, ?) ON CONFLICT (art, id) DO UPDATE SET daten = excluded.daten WHERE lage_id = excluded.lage_id',
    ),
    e: db.prepare('SELECT daten FROM eintrag WHERE lage_id = ? AND art = ? AND id = ?'),
    eExist: db.prepare('SELECT lage_id FROM eintrag WHERE art = ? AND id = ?'),
    eListe: db.prepare('SELECT daten FROM eintrag WHERE lage_id = ? AND art = ? ORDER BY t, rowid'),
    eLetzte: db.prepare('SELECT daten FROM (SELECT daten, t, rowid FROM eintrag WHERE lage_id = ? AND art = ? ORDER BY t DESC, rowid DESC LIMIT ?) ORDER BY t, rowid'),
    eWeg: db.prepare('DELETE FROM eintrag WHERE lage_id = ? AND art = ? AND id = ?'),
    eAnzahl: db.prepare('SELECT COUNT(*) AS n FROM eintrag WHERE lage_id = ? AND art = ?'),
    fotoNeu: db.prepare('INSERT INTO foto (id, lage_id, ext, von, t) VALUES (?, ?, ?, ?, ?)'),
    foto: db.prepare('SELECT lage_id, ext FROM foto WHERE id = ?'),
    fotoAnzahl: db.prepare('SELECT COUNT(*) AS n FROM foto WHERE lage_id = ?'),
  };

  return {
    lageErstellen(lage: Lage, tnCodeHash: string, ltgCodeHash: string): void {
      q.lageNeu.run(lage.id, JSON.stringify(lage), tnCodeHash, ltgCodeHash);
    },
    lage: (id: string): Lage | undefined => json<Lage>(q.lage.get(id)),
    lageNachCodeHash(hash: string): { lage: Lage; rolle: Rolle } | undefined {
      const z = q.lageCode.get(hash, hash, hash);
      return z && { lage: json<Lage>(z)!, rolle: z.tn ? 'teilnehmer' : 'leitung' };
    },
    lageSpeichern(lage: Lage): void {
      q.lageUpd.run(JSON.stringify(lage), lage.id);
    },
    /** Neuer Teilnehmer-Code: der alte wird ungültig, bestehende Tokens bleiben. */
    teilnehmerCodeSetzen(lageId: string, hash: string): void {
      q.lageTnCode.run(hash, lageId);
    },
    lageLoeschen(id: string): void {
      db.exec('BEGIN');
      try {
        for (const t of ['lage WHERE id', 'teilnehmer WHERE lage_id', 'spur WHERE lage_id', 'eintrag WHERE lage_id', 'foto WHERE lage_id'])
          db.prepare(`DELETE FROM ${t} = ?`).run(id);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    teilnehmerErstellen(lageId: string, t: Teilnehmer, tokenHash: string): void {
      q.tnNeu.run(t.id, lageId, tokenHash, JSON.stringify(t));
    },
    teilnehmerNachToken(hash: string): { lageId: string; teilnehmer: Teilnehmer } | undefined {
      const z = q.tnToken.get(hash);
      return z && { lageId: z.lage_id as string, teilnehmer: json<Teilnehmer>(z)! };
    },
    teilnehmerSpeichern(t: Teilnehmer): void {
      q.tnUpd.run(JSON.stringify(t), t.id);
    },
    teilnehmerEntfernen(lageId: string, id: string): boolean {
      return Number(q.tnWeg.run(id, lageId).changes) > 0;
    },
    teilnehmerAktiv: (lageId: string, id: string): boolean => q.tnAktiv.get(id, lageId) !== undefined,
    /** Aktive Teilnehmende; mit `auchEntfernte` alle (für Export). */
    teilnehmerListe(lageId: string, auchEntfernte = false): Teilnehmer[] {
      return (auchEntfernte ? q.tnAlle : q.tnListe).all(lageId).map((z) => json<Teilnehmer>(z)!);
    },

    spurAnhaengen(lageId: string, teilnehmerId: string, pos: Position): void {
      q.spurNeu.run(lageId, teilnehmerId, pos.t, JSON.stringify(pos));
    },
    spuren(lageId: string, seit = 0): Spuren {
      const s: Spuren = {};
      for (const z of q.spuren.all(lageId, seit)) (s[z.teilnehmer_id as string] ??= []).push(json<Position>(z)!);
      return s;
    },

    /** Neu anlegen oder ersetzen. false, wenn die ID schon in einer anderen Lage vergeben ist. */
    speichern<A extends Art>(lageId: string, art: A, obj: Eintraege[A], t: number): boolean {
      return Number(q.eNeu.run(art, obj.id, lageId, t, JSON.stringify(obj)).changes) > 0;
    },
    eintrag: <A extends Art>(lageId: string, art: A, id: string): Eintraege[A] | undefined =>
      json<Eintraege[A]>(q.e.get(lageId, art, id)),
    idVergeben: (art: Art, id: string): boolean => q.eExist.get(art, id) !== undefined,
    /** Aufsteigend nach Zeit; mit `letzte` nur die jüngsten n. */
    eintraege<A extends Art>(lageId: string, art: A, letzte?: number): Eintraege[A][] {
      const zeilen = letzte === undefined ? q.eListe.all(lageId, art) : q.eLetzte.all(lageId, art, letzte);
      return zeilen.map((z) => json<Eintraege[A]>(z)!);
    },
    loeschen: (lageId: string, art: Art, id: string): boolean => Number(q.eWeg.run(lageId, art, id).changes) > 0,
    anzahl: (lageId: string, art: Art): number => Number(q.eAnzahl.get(lageId, art)!.n),

    fotoSpeichern(id: string, lageId: string, ext: string, von: string): void {
      q.fotoNeu.run(id, lageId, ext, von, Date.now());
    },
    fotoAnzahl: (lageId: string): number => Number(q.fotoAnzahl.get(lageId)!.n),
    foto(id: string): { lageId: string; ext: string } | undefined {
      const z = q.foto.get(id);
      return z && { lageId: z.lage_id as string, ext: z.ext as string };
    },

    /** Legt die Standard-Ebene an, falls sie fehlt (neue Lage, ältere Lagen beim ersten Verbinden). Gibt alle Ebenen zurück. */
    ebenenSicherstellen(lageId: string): Ebene[] {
      const id = standardEbeneId(lageId);
      if (!q.e.get(lageId, 'ebene', id)) {
        const jetzt = Date.now();
        const e: Ebene = { id, name: STANDARD_EBENE_NAME, gesperrt: false, reihenfolge: 0, erstelltVon: 'system', erstelltAm: jetzt };
        q.eNeu.run('ebene', id, lageId, jetzt, JSON.stringify(e));
      }
      return this.eintraege(lageId, 'ebene').sort((a, b) => a.reihenfolge - b.reihenfolge || a.erstelltAm - b.erstelltAm);
    },

    schliessen: (): void => db.close(),
  };
}

export type Db = ReturnType<typeof oeffneDb>;
