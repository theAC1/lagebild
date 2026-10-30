// Rückgängig/Wiederholen für eigene Aktionen der Sitzung. Jede Aktion kennt ihre Umkehrung als Servernachrichten.
import { MAX_NACHRICHT, MAX_ZEICHNUNGEN_JE_MSG, type ClientMsg, type ZeichnungAenderung } from '../../../../shared/protocol.ts';

/** Zeichnung ohne Server-Felder, immer mit ID (vom Client vergeben, damit sie rückgängig gemacht werden kann). */
export type ZInhalt = ZeichnungAenderung;

export type Eintrag =
  | { typ: 'neu'; zeichnungen: ZInhalt[] }
  | { typ: 'aendern'; vorher: ZInhalt[]; nachher: ZInhalt[] }
  | { typ: 'loeschen'; zeichnungen: (ZInhalt & { von?: string })[] };

/** Liste in Stücke zu höchstens n (Server nimmt max. 100 je Nachricht). */
export const stuecke = <T>(xs: T[], n = MAX_ZEICHNUNGEN_JE_MSG): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

/** Platz je Nachricht für Zeichnungen; Rest für Hülle und Mehrbyte-Zeichen in Texten. */
export const MAX_ZEICHEN_JE_MSG = Math.floor(MAX_NACHRICHT * 0.7);

/** Zeichnungen in Stücke, die nach Anzahl und Grösse in eine Nachricht passen (sonst schliesst der Server die Verbindung). */
export function stueckeNachGroesse(zs: ZInhalt[]): ZInhalt[][] {
  const out: ZInhalt[][] = [];
  let stueck: ZInhalt[] = [];
  let groesse = 0;
  for (const z of zs) {
    const n = JSON.stringify(z).length;
    if (stueck.length && (stueck.length >= MAX_ZEICHNUNGEN_JE_MSG || groesse + n > MAX_ZEICHEN_JE_MSG)) {
      out.push(stueck);
      stueck = [];
      groesse = 0;
    }
    stueck.push(z);
    groesse += n;
  }
  if (stueck.length) out.push(stueck);
  return out;
}

const neu = (zs: ZInhalt[]): ClientMsg[] => stueckeNachGroesse(zs).map((s) => ({ typ: 'zeichnung.neu', zeichnungen: s }));
const aendern = (zs: ZInhalt[]): ClientMsg[] => stueckeNachGroesse(zs).map((s) => ({ typ: 'zeichnung.aendern', zeichnungen: s }));
const loeschen = (zs: ZInhalt[]): ClientMsg[] => stuecke(zs.map((z) => z.id)).map((ids) => ({ typ: 'zeichnung.loeschen', ids }));

/** Nachrichten, die den Eintrag ausführen (vor) bzw. aufheben (zurueck). */
export function nachrichten(e: Eintrag, richtung: 'vor' | 'zurueck'): ClientMsg[] {
  const v = richtung === 'vor';
  switch (e.typ) {
    case 'neu':
      return v ? neu(e.zeichnungen) : loeschen(e.zeichnungen);
    case 'loeschen':
      return v ? loeschen(e.zeichnungen) : neu(e.zeichnungen);
    case 'aendern':
      return aendern(v ? e.nachher : e.vorher);
  }
}

export const MAX_VERLAUF = 100;

export class Verlauf {
  private zurueck: Eintrag[] = [];
  private vor: Eintrag[] = [];

  /** Neue Aktion: kommt oben auf den Stapel, Wiederholen verfällt. */
  tue(e: Eintrag): void {
    this.zurueck = [...this.zurueck, e].slice(-MAX_VERLAUF);
    this.vor = [];
  }
  /** Letzte Aktion rückgängig machen: der Eintrag und die Nachrichten dazu, oder null. */
  rueckgaengig(): { eintrag: Eintrag; msgs: ClientMsg[] } | null {
    const e = this.zurueck.at(-1);
    if (!e) return null;
    this.zurueck = this.zurueck.slice(0, -1);
    this.vor = [...this.vor, e];
    return { eintrag: e, msgs: nachrichten(e, 'zurueck') };
  }
  wiederholen(): { eintrag: Eintrag; msgs: ClientMsg[] } | null {
    const e = this.vor.at(-1);
    if (!e) return null;
    this.vor = this.vor.slice(0, -1);
    this.zurueck = [...this.zurueck, e];
    return { eintrag: e, msgs: nachrichten(e, 'vor') };
  }
  /** Eintrag ganz verwerfen (Server lehnte ab): sonst würde Rückgängig etwas umkehren, das nie geschah. */
  entferne(e: Eintrag): void {
    this.zurueck = this.zurueck.filter((x) => x !== e);
    this.vor = this.vor.filter((x) => x !== e);
  }
  get kannZurueck(): boolean {
    return this.zurueck.length > 0;
  }
  get kannVor(): boolean {
    return this.vor.length > 0;
  }
  leeren(): void {
    this.zurueck = [];
    this.vor = [];
  }
}
