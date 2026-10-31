// Wiedergabe (AN): lädt das Protokoll, setzt den Lagezustand im Store auf den Stand zum Zeitpunkt und stellt beim
// Beenden den Live-Stand wieder her. So zeichnen die normalen Kartenlayer die Wiedergabe, ohne eigene Darstellung.
import { SvelteMap } from 'svelte/reactivity';
import { OFFLINE_MS, standardEbeneId, type Meldung, type Protokoll, type ProtokollEintrag, type ProtokollSeite, type Spuren, type Teilnehmer } from '../../../../shared/protocol.ts';
import { api, beiNachricht, merkeEmpfang, store } from '../../lib/store.svelte.ts';
import { Falter, lvFenster, posBei, versatzAus, zeitAus, type Fenster } from './logik.ts';

export const TEMPI = [1, 10, 60] as const;
export type Tempo = (typeof TEMPI)[number];
const TAKT_MS = 200;

class Wiedergabe {
  protokoll = $state.raw<Protokoll | null>(null);
  fehler = $state<string | null>(null);
  /** angezeigter Zeitpunkt (echte Zeit) */
  t = $state(0);
  spielt = $state(false);
  tempo = $state<Tempo>(10);
  /** Lage, deren Wechsel nach AN dieses Gerät ausgelöst hat: dort öffnet die Wiedergabe von selbst (Oeffner). */
  selbstOeffnenFuer = $state('');
}
export const wg = new Wiedergabe();

/** LV-Zeiträume der Lage (in AN alle abgeschlossen). */
export const fenster = (): Fenster[] => (store.lage ? lvFenster(store.lage.phasen, Date.now()) : []);

type Sicherung = Pick<typeof store, 'marker' | 'sichtungen' | 'ebenen' | 'zeichnungen' | 'taufen' | 'bloodhound' | 'alarme' | 'teilnehmer' | 'chat' | 'meldungen'>;
const KARTEN = ['marker', 'sichtungen', 'ebenen', 'zeichnungen', 'taufen', 'bloodhound', 'alarme'] as const;

let sicherung: Sicherung | null = null;
let falter: Falter | null = null;
let gezeigt = -1;
let takt: ReturnType<typeof setInterval> | undefined;
let abHoeren = (): void => {};
/** Zählt Start/Stopp: ein Laden, das erst nach dem Schliessen fertig wird, übernimmt nichts mehr. */
let lauf = 0;

function sichere(): Sicherung {
  const kopie = <T>(m: SvelteMap<string, T>) => new SvelteMap(m);
  return {
    marker: kopie(store.marker), sichtungen: kopie(store.sichtungen), ebenen: kopie(store.ebenen), zeichnungen: kopie(store.zeichnungen),
    taufen: kopie(store.taufen), bloodhound: kopie(store.bloodhound), alarme: kopie(store.alarme), teilnehmer: kopie(store.teilnehmer),
    chat: store.chat, meldungen: store.meldungen,
  };
}

function fuelle<T>(ziel: SvelteMap<string, T>, quelle: Map<string, T>): void {
  ziel.clear();
  for (const [k, v] of quelle) ziel.set(k, v);
}

/** Stand zum Zeitpunkt t in den Store schreiben (Objekte nur bei neuen Ereignissen, Teilnehmende nur bei Änderung). */
function zeige(t: number): void {
  if (!falter || !sicherung || !wg.protokoll || !store.lage) return;
  wg.t = t;
  store.wiedergabeZeit = t;
  const s = falter.stand(t);
  if (s.version !== gezeigt) {
    gezeigt = s.version;
    for (const k of KARTEN) fuelle(store[k] as SvelteMap<string, unknown>, s[k] as Map<string, unknown>);
    store.chat = [...s.chat];
    store.meldungen = s.meldungen.slice(-500);
  }
  const status = new Map<string, Meldung>();
  for (const m of s.meldungen) if (m.status !== null) status.set(m.von, m);
  for (const tn of sicherung.teilnehmer.values()) {
    const pos = posBei(wg.protokoll.spuren[tn.id], t);
    const st = status.get(tn.id);
    const neu: Teilnehmer = {
      ...tn, pos, online: !!pos && t - pos.t < OFFLINE_MS, zuletzt: pos?.t ?? tn.zuletzt,
      status: st?.status ?? store.lage.statusSet[0].key, statusText: st?.text ?? '',
    };
    const alt = store.teilnehmer.get(tn.id);
    if (alt && alt.pos?.t === pos?.t && alt.status === neu.status && alt.statusText === neu.statusText && alt.online === neu.online) continue;
    merkeEmpfang(neu, pos?.t ?? 0);
    store.teilnehmer.set(tn.id, neu);
  }
}

/** Protokoll Seite um Seite (der Server liefert höchstens MAX_PROTOKOLL_SEITE je Antwort), dann die Spuren ab der ersten LV. */
async function ladeProtokoll(nr: number): Promise<Protokoll | undefined> {
  const ereignisse: ProtokollEintrag[] = [];
  let seite: ProtokollSeite | undefined;
  do {
    seite = (await (await api(`/api/protokoll${seite ? `?seit=${seite.weiter}` : ''}`)).json()) as ProtokollSeite;
    if (nr !== lauf) return undefined;
    for (const e of seite.ereignisse) ereignisse.push(e);
  } while (seite.weiter !== null);
  const spuren: Spuren = await (await api(`/api/spuren?seit=${fenster()[0]?.von ?? 0}`)).json();
  return { teilnehmer: seite.teilnehmer, ereignisse, spuren };
}

/** Zeitleiste öffnen: Protokoll laden, am Anfang der ersten LV stehen (pausiert). */
export async function starte(): Promise<void> {
  wg.fehler = null;
  const nr = ++lauf;
  try {
    const p = await ladeProtokoll(nr);
    if (!p || nr !== lauf || !store.lage) return;
    sicherung = sichere();
    wg.protokoll = p;
    const basis = [...sicherung.ebenen.values()].filter((e) => e.id === standardEbeneId(store.lage!.id));
    falter = new Falter(p.ereignisse, basis);
    gezeigt = -1;
    // Neuverbindung bringt einen Live-Snapshot: als neue Sicherung nehmen und den Zeitpunkt wieder zeigen
    abHoeren = beiNachricht((m) => {
      if (m.typ !== 'snapshot' || !sicherung) return;
      sicherung = sichere();
      gezeigt = -1;
      zeige(wg.t);
    });
    zeige(zeitAus(fenster(), 0));
  } catch (e) {
    if (nr === lauf) wg.fehler = (e as Error).message;
  }
}

/** Live-Stand zurück. */
export function stoppe(): void {
  lauf++;
  pause();
  abHoeren();
  abHoeren = () => {};
  const s = sicherung;
  sicherung = null;
  falter = null;
  wg.protokoll = null;
  store.wiedergabeZeit = null;
  if (!s) return;
  for (const k of KARTEN) fuelle(store[k] as SvelteMap<string, unknown>, s[k]);
  fuelle(store.teilnehmer, s.teilnehmer);
  for (const tn of s.teilnehmer.values()) merkeEmpfang(tn, tn.zuletzt);
  store.chat = s.chat;
  store.meldungen = s.meldungen;
}

export const springe = (t: number): void => zeige(t);
export const springeVersatz = (v: number): void => zeige(zeitAus(fenster(), v));

export function pause(): void {
  clearInterval(takt);
  wg.spielt = false;
}

export function spiele(): void {
  const f = fenster();
  if (versatzAus(f, wg.t) >= versatzAus(f, f.at(-1)?.bis ?? 0)) zeige(zeitAus(f, 0)); // am Ende: von vorn
  wg.spielt = true;
  clearInterval(takt);
  takt = setInterval(() => {
    const fe = fenster();
    const v = versatzAus(fe, wg.t) + TAKT_MS * wg.tempo;
    zeige(zeitAus(fe, v));
    if (v >= versatzAus(fe, fe.at(-1)?.bis ?? 0)) pause();
  }, TAKT_MS);
}
