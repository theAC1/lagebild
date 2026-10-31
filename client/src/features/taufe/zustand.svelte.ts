// Zustand und Aktionen der Geländetaufe: Taufmodus, getipptes Objekt (wartet auf den Namen), Verlängern, Umfärben.
import { MAX_TAUF_PUNKTE, type Fassade, type Punkt, type Taufe, type TaufeAenderung, type TaufFamilie, type TaufGeometrie } from '../../../../shared/protocol.ts';
import { OHNE_QUITTUNG, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
import { toast } from '../../lib/ui.svelte.ts';
import { fassadenFarben, fassadeVonKante, naechsteFassade } from './fassaden.ts';
import { alsGeometrie, haengeAn, imRing, linienVon, vereinePolygone, type Linie, type Ring, type XY } from './geo.ts';

/** Ab dieser Zoomstufe sind Objekte antippbar (Kachel-Daten bis z14, darunter zu klein zum Treffen). */
export const MIN_ZOOM = 15;

/** Getipptes oder gezeichnetes Objekt, das auf seinen Namen wartet. */
export type Wahl = {
  familie: TaufFamilie;
  geometrie: TaufGeometrie;
  quelle: Taufe['quelle'];
  objektart: string;
  /** Name in den swisstopo-Daten (z.B. Bachname), nur als Hinweis */
  vorlage?: string;
  /** gezeichnete Fläche: Familie frei wählbar */
  familieWaehlbar: boolean;
  /** Gebäude: angetippte Teile (Welt-Polygone je Teil); die Geometrie ist ihre Vereinigung */
  teile?: Ring[][][];
};

/** Fläche im Bau (`fertig` = abgeschlossen, Punkte nur noch bearbeiten); `id` = gespeicherte Taufe, `griff` = gewählter Punkt. */
export type Entwurf = { punkte: Punkt[]; fertig: boolean; id?: string; griff?: number };

class TaufZustand {
  modus = $state(false);
  wahl = $state.raw<Wahl | null>(null);
  /** Strasse/Gewässer, an die weitere Abschnitte angehängt werden */
  verlaengern = $state<string | null>(null);
  /** Taufe, deren Fassaden per Tipp umgefärbt werden */
  umfaerben = $state<string | null>(null);
  /** Fläche/Wald im Bau oder Punkte einer gezeichneten Taufe in Bearbeitung */
  zeichnen = $state.raw<Entwurf | null>(null);
  zoom = $state(0);
}

export const tz = new TaufZustand();

export function beendeModus(): void {
  tz.modus = false;
  tz.wahl = null;
  tz.verlaengern = null;
  tz.zeichnen = null;
}

const echoVon = (pruef: (t: Taufe) => boolean) => (m: { typ: string; taufe?: Taufe }) => m.typ === 'taufe' && !!m.taufe && pruef(m.taufe);

/** Tauft das gewählte Objekt. Gibt die neue Taufe zurück (bei Ablehnung bleibt die Wahl offen). */
export async function taufe(name: string, familie = tz.wahl?.familie): Promise<Taufe | null> {
  const w = tz.wahl;
  if (!w || !familie) return null;
  let neu: Taufe | null = null;
  const z = await sendeBestaetigt(
    { typ: 'taufe.neu', taufe: { familie, name, geometrie: w.geometrie, quelle: w.quelle, objektart: w.objektart, stoss: null, fassaden: [], ziel: false } },
    (m) => echoVon((t) => t.name === name.trim() && t.von === store.ich)(m) && !!(neu = (m as { taufe: Taufe }).taufe),
  );
  if (z === 'unbestaetigt') toast(OHNE_QUITTUNG);
  if (z !== 'bestaetigt' || !neu) return null;
  tz.wahl = null;
  return neu;
}

export async function aendere(a: TaufeAenderung): Promise<boolean> {
  const z = await sendeBestaetigt({ typ: 'taufe.aendern', taufe: a }, echoVon((t) => t.id === a.id));
  if (z === 'unbestaetigt') toast(OHNE_QUITTUNG);
  return z === 'bestaetigt';
}

export async function loesche(id: string): Promise<boolean> {
  const z = await sendeBestaetigt({ typ: 'taufe.loeschen', id }, (m) => m.typ === 'taufe.geloescht' && m.id === id);
  if (z === 'unbestaetigt') toast(OHNE_QUITTUNG);
  return z === 'bestaetigt';
}

/**
 * Gebäudeteil antippen (Juan, 31.10.: swisstopo teilt Gebäude in Unterelemente): der erste Tipp wählt ein Teil,
 * jeder weitere fügt eines hinzu, ein Tipp auf ein gewähltes Teil nimmt es wieder weg. Getauft wird der gemeinsame
 * Umriss. Gibt false zurück, wenn kein Teil mehr gewählt ist.
 */
export function sammleTeil(teil: Ring[][], tipp: XY, objektart: string): boolean {
  const alt = tz.wahl?.teile ?? [];
  const i = alt.findIndex((t) => t.some((p) => imRing(tipp, p[0])));
  const teile = i >= 0 ? alt.filter((_, j) => j !== i) : [...alt, teil];
  tz.wahl = teile.length ? { familie: 'gebaeude', geometrie: alsGeometrie({ polygone: vereinePolygone(teile.flat()) }, MAX_TAUF_PUNKTE), quelle: 'vt', objektart, familieWaehlbar: false, teile } : null;
  return teile.length > 0;
}

/** Abschnitt an die Strasse/das Gewässer `id` anhängen. */
export async function verlaengere(id: string, abschnitt: Linie): Promise<void> {
  const t = store.taufen.get(id);
  if (!t) return;
  const alt = linienVon(t.geometrie);
  const neu = haengeAn(alt, abschnitt);
  if (neu === alt) return toast('Abschnitt gehört schon dazu.');
  if (await aendere({ id, geometrie: alsGeometrie({ linien: neu }, MAX_TAUF_PUNKTE) })) toast(`Abschnitt an «${t.name}» angehängt`, 2000);
}

/** Fassade (alle Kanten gleicher berechneter Farbe um Kante `kante`) auf die nächste Farbe schalten. */
export function faerbeUm(t: Taufe, kante: number): void {
  const jetzt = fassadenFarben(t).find((f) => f.kante.i === kante)?.farbe;
  if (!jetzt) return;
  const neu = naechsteFassade(jetzt);
  const betroffen = new Set(fassadeVonKante(t, kante));
  const fassaden: [number, Fassade][] = [...t.fassaden.filter(([i]) => !betroffen.has(i)), ...[...betroffen].map((i): [number, Fassade] => [i, neu])];
  void aendere({ id: t.id, fassaden });
}
