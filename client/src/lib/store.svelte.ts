// Reaktiver Lagezustand + WebSocket-Verbindung + REST-Helfer.
import { SvelteMap } from 'svelte/reactivity';
import {
  staleNachFuer,
  STILLE_MS,
  type Alarm,
  type Beigetreten,
  type Chat,
  type ClientMsg,
  type Lage,
  type Marker,
  type Meldung,
  type Position,
  type ServerMsg,
  type Sichtung,
  type Teilnehmer,
} from '../../../shared/protocol.ts';
import { lies, schliesseAlle, schreibe, toast, ui } from './ui.svelte.ts';
import type { KoordFormat } from './coords.ts';
import type { Basiskarte, Overlay } from './karten.ts';
import { frischeAus, sollSenden, STILLSTAND_INTERVALL_MS, STILLSTAND_MS, type Frische } from './senden.ts';
export type { Frische };

const TOKEN_KEY = 'lagebild.token';
const EINST_KEY = 'lagebild.einstellungen';
const MAX_LOG = 500;

export type Verbindung = 'getrennt' | 'verbinde' | 'verbunden';
export interface Einstellungen {
  intervallS: 5 | 10 | 30;
  /** «Dynamisch»: im Stillstand (< 0.45 m/s) nur alle 30 s senden */
  dynamisch: boolean;
  wachhalten: boolean;
  koordFormat: KoordFormat;
  basiskarte: Basiskarte;
  overlays: Overlay[];
  /** Bildschirmausrichtung: fix oder dem Gerät folgend */
  ausrichtung: 'auto' | 'hoch' | 'quer';
  /** Koordinatenzeile unten (Tippen aufs eigene Symbol schaltet) */
  koordLeiste: boolean;
}
const STANDARD_EINST: Einstellungen = {
  intervallS: 10,
  dynamisch: false,
  wachhalten: false,
  koordFormat: 'lv95',
  basiskarte: 'farbe',
  overlays: [],
  ausrichtung: 'auto',
  koordLeiste: false,
};

function ladeEinstellungen(): Einstellungen {
  try {
    return { ...STANDARD_EINST, ...JSON.parse(lies(EINST_KEY) ?? '{}') };
  } catch {
    return { ...STANDARD_EINST };
  }
}

class LageStore {
  token = $state<string | null>(lies(TOKEN_KEY));
  lage = $state<Lage | null>(null);
  /** eigene Teilnehmer-ID */
  ich = $state<string | null>(null);
  teilnehmer = new SvelteMap<string, Teilnehmer>();
  marker = new SvelteMap<string, Marker>();
  sichtungen = new SvelteMap<string, Sichtung>();
  /** inkl. aufgehobener seit dem Snapshot (aufgehobenAm != null) */
  alarme = new SvelteMap<string, Alarm>();
  chat = $state<Chat[]>([]);
  meldungen = $state<Meldung[]>([]);
  verbindung = $state<Verbindung>('getrennt');
  /** Lage beendet, ich bin Leitung: Token bleibt für Export und Löschen, keine Verbindung mehr. */
  beendet = $state(false);
  /** eigene Live-Position vom Gerät (nicht vom Server) */
  meinePos = $state<Position | null>(null);
  gpsFehler = $state<string | null>(null);
  einstellungen = $state<Einstellungen>(ladeEinstellungen());
  /** Serverzeit − Gerätezeit in ms (aus dem Snapshot). */
  zeitversatz = $state(0);
  /** Gerätezeit, tickt alle 5 s – für Alters- und Stale-Anzeigen. */
  jetzt = $state(Date.now());

  ichSelbst = $derived(this.ich ? (this.teilnehmer.get(this.ich) ?? null) : null);
  istLeitung = $derived(this.ichSelbst?.rolle === 'leitung');
  /** Eigener, nicht aufgehobener Alarm → Position wird trotz Emission Control gesendet. */
  meinAlarmAktiv = $derived([...this.alarme.values()].some((a) => a.von === this.ich && a.aufgehobenAm === null));
}

export const store = new LageStore();
export const token = () => store.token;

setInterval(() => (store.jetzt = Date.now()), 5000);

export const serverJetzt = () => store.jetzt + store.zeitversatz;

/** Empfangszeit (Serverzeit) der aktuellen Position je Teilnehmer – Basis für staleNach. */
const posEmpfang = new Map<string, number>();
// ponytail: der Snapshot kennt keine Empfangszeit, `zuletzt` (letzte Aktivität) ist die beste Näherung.
// Überschätzt die Frische, wenn danach nur noch Status kam; ein Feld `posEmpfangenAm` im Vertrag würde das lösen.
const merkeEmpfang = (t: Teilnehmer, zeit: number) => (t.pos ? posEmpfang.set(t.id, zeit) : posEmpfang.delete(t.id));

/** Alter der aktuellen Position in ms (Serverzeit); ohne Position seit letzter Aktivität. */
export const alterMs = (t: Teilnehmer) => Math.max(0, serverJetzt() - (posEmpfang.get(t.id) ?? t.zuletzt));

/** aktiv → stale (ab Empfang + pos.staleNach, oder sofort offline) → geist (nach OFFLINE_MS). */
export const frische = (t: Teilnehmer): Frische => frischeAus(alterMs(t), t.online, t.pos?.staleNach);

/** Verbunden und sendet, aber die Position ist abgelaufen (CoT «h-e» statt «m-g»). */
export const keinGps = (t: Teilnehmer) => t.online && t.sendetPos && t.pos !== null && frische(t) === 'stale';

export function statusDef(key: string) {
  return store.lage?.statusSet.find((s) => s.key === key) ?? null;
}

export function setzeEinstellung<K extends keyof Einstellungen>(k: K, v: Einstellungen[K]): void {
  store.einstellungen = { ...store.einstellungen, [k]: v };
  schreibe(EINST_KEY, JSON.stringify(store.einstellungen));
}

// --- Nachrichten-Hörer für Features (z.B. Vibration bei Alarm, Ungelesen-Zähler) ---------

const hoerer = new Set<(m: ServerMsg) => void>();
/** Wird nach dem Anwenden jeder Servernachricht aufgerufen. Gibt eine Abmeldefunktion zurück. */
export function beiNachricht(cb: (m: ServerMsg) => void): () => void {
  hoerer.add(cb);
  return () => hoerer.delete(cb);
}

const ersetze = <T extends { id: string }>(map: SvelteMap<string, T>, liste: T[]) => {
  map.clear();
  for (const x of liste) map.set(x.id, x);
};

export function wende(m: ServerMsg): void {
  switch (m.typ) {
    case 'snapshot':
      store.ich = m.ich;
      store.lage = m.lage;
      store.zeitversatz = m.serverZeit - Date.now();
      posEmpfang.clear();
      for (const t of m.teilnehmer) merkeEmpfang(t, t.zuletzt);
      ersetze(store.teilnehmer, m.teilnehmer);
      ersetze(store.marker, m.marker);
      ersetze(store.sichtungen, m.sichtungen);
      ersetze(store.alarme, m.alarme);
      store.chat = m.chat;
      store.meldungen = m.meldungen;
      store.verbindung = 'verbunden';
      versuch = 0;
      sendePosJetzt(); // nach (Wieder-)Verbindung sofort zeigen, wo ich bin
      break;
    case 'teilnehmer': {
      const alt = store.teilnehmer.get(m.teilnehmer.id);
      // Statuswechsel o.ä. bringt dieselbe Position mit → Empfangszeit nur bei neuer Position setzen
      if (!alt?.pos || alt.pos.t !== m.teilnehmer.pos?.t) merkeEmpfang(m.teilnehmer, serverJetzt());
      store.teilnehmer.set(m.teilnehmer.id, m.teilnehmer);
      break;
    }
    case 'teilnehmer.weg':
      posEmpfang.delete(m.id);
      store.teilnehmer.delete(m.id);
      break;
    case 'pos': {
      const t = store.teilnehmer.get(m.id);
      if (!t) break;
      const neu = { ...t, pos: m.pos, online: true, zuletzt: Math.max(t.zuletzt, serverJetzt()) };
      merkeEmpfang(neu, serverJetzt());
      store.teilnehmer.set(m.id, neu);
      break;
    }
    case 'marker':
      store.marker.set(m.marker.id, m.marker);
      break;
    case 'marker.geloescht':
      store.marker.delete(m.id);
      break;
    case 'chat':
      if (!store.chat.some((c) => c.id === m.chat.id)) store.chat = [...store.chat, m.chat].slice(-MAX_LOG);
      break;
    case 'sichtung':
      store.sichtungen.set(m.sichtung.id, m.sichtung);
      break;
    case 'alarm':
      store.alarme.set(m.alarm.id, m.alarm);
      break;
    case 'meldung':
      store.meldungen = [...store.meldungen, m.meldung].slice(-MAX_LOG);
      break;
    case 'lage':
      store.lage = m.lage;
      break;
    case 'beendet':
      if (m.lage) nachbereitung(m.lage);
      else abmelden('Die Lage wurde beendet oder du wurdest entfernt.');
      return;
    case 'fehler':
      toast(m.meldung);
      break;
    case 'ping':
    case 'code': // Antwort für Leitung › Zugang (beiNachricht)
      break;
  }
  for (const cb of hoerer) {
    try {
      cb(m);
    } catch (e) {
      console.error('Hörer-Fehler', e);
    }
  }
}

// --- WebSocket mit Auto-Reconnect --------------------------------------------------------

let ws: WebSocket | null = null;
let versuch = 0;
let wiederTimer: ReturnType<typeof setTimeout> | undefined;
/** Letztes Lebenszeichen der Verbindung (Gerätezeit); der Server sendet spätestens alle PING_MS. */
let zuletztGehoert = 0;

export function verbinde(): void {
  clearTimeout(wiederTimer);
  if (!store.token || store.beendet || ws) return;
  store.verbindung = 'verbinde';
  const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws = s;
  zuletztGehoert = Date.now();
  s.onopen = () => {
    if (store.token) s.send(JSON.stringify({ typ: 'hallo', token: store.token } satisfies ClientMsg));
  };
  s.onmessage = (e) => {
    zuletztGehoert = Date.now();
    let m: ServerMsg;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    wende(m);
  };
  s.onclose = () => {
    if (ws === s) getrennt();
  };
}

function getrennt() {
  ws = null;
  store.verbindung = 'getrennt';
  if (store.token && !store.beendet) {
    // Backoff 1 s … 30 s mit Streuung, damit nicht alle Geräte gleichzeitig anklopfen
    const ms = Math.min(30_000, 1000 * 2 ** versuch++) * (0.75 + Math.random() * 0.5);
    wiederTimer = setTimeout(verbinde, ms);
  }
}

// Watchdog: Im Funkloch bleibt ein halb offener Socket minutenlang OPEN (kein FIN/RST). Ohne Lebenszeichen
// gilt er als tot → schliessen und neu verbinden, damit send() nicht fälschlich Erfolg meldet.
setInterval(() => {
  if (!ws || Date.now() - zuletztGehoert <= STILLE_MS) return;
  const tot = ws;
  getrennt();
  tot.close();
}, 5000);

function sofortWieder() {
  if (store.token && !ws) {
    versuch = 0;
    verbinde();
  }
}
addEventListener('online', sofortWieder);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sofortWieder());

export type Zustellung = 'bestaetigt' | 'abgelehnt' | 'unbestaetigt';
export const OHNE_QUITTUNG = 'Nicht bestätigt – keine Verbindung. Funk benutzen!';

/**
 * Sendet und wartet auf das Echo des Servers (`echo`). 'abgelehnt': Server meldete einen Fehler (Toast kam schon);
 * 'unbestaetigt': keine Verbindung oder keine Antwort in `ms` (z.B. Funkloch bei scheinbar offener Verbindung).
 */
export function sendeBestaetigt(msg: ClientMsg, echo: (m: ServerMsg) => boolean, ms = 5000): Promise<Zustellung> {
  if (!send(msg)) return Promise.resolve('unbestaetigt');
  return new Promise((ok) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ende = (z: Zustellung) => {
      clearTimeout(timer);
      ab();
      ok(z);
    };
    const ab = beiNachricht((m) => {
      if (m.typ === 'fehler') ende('abgelehnt');
      else if (echo(m)) ende('bestaetigt');
    });
    timer = setTimeout(() => ende('unbestaetigt'), ms);
  });
}

/** Sendet an den Server. false, wenn gerade keine Verbindung besteht (nichts wird gepuffert). */
export function send(msg: ClientMsg): boolean {
  if (ws?.readyState !== WebSocket.OPEN || store.verbindung !== 'verbunden') return false;
  ws.send(JSON.stringify(msg));
  // Ereignisse, nach denen die eigene Position sofort raus soll (ATAK: REPORT_LOCATION)
  if (msg.typ === 'status' || msg.typ === 'alarm.ausloesen' || (msg.typ === 'sendetPos' && msg.an)) sendePosJetzt();
  return true;
}

// --- Eigene Position senden ---------------------------------------------------------------

let letzteGesendet: { t: number; pos: Position } | null = null;
let erzwingen = false;

/** Aktuelles Sendeintervall in ms («Dynamisch»: im Stillstand 30 s). */
function intervallMs(pos: Position): number {
  const { intervallS, dynamisch } = store.einstellungen;
  return dynamisch && pos.tempo != null && pos.tempo < STILLSTAND_MS ? STILLSTAND_INTERVALL_MS : intervallS * 1000;
}

/** Eigene Position, wie sie gesendet wird (mit staleNach aus dem aktuellen Intervall); null ohne GPS. */
export function meinePosZumSenden(): Position | null {
  const p = store.meinePos;
  return p ? { ...p, staleNach: staleNachFuer(intervallMs(p)) } : null;
}

/** Wird jede Sekunde und bei jedem GPS-Fix aufgerufen: sendet nach Intervall, Bewegung oder Ereignis. */
export function pruefeSenden(): void {
  const pos = meinePosZumSenden();
  if (!pos || !store.ichSelbst) return;
  if (!store.ichSelbst.sendetPos && !store.meinAlarmAktiv) return; // Emission Control (ausser bei eigenem Alarm)
  // GPS-Fehler nach dem letzten Fix: den alten Fix nicht als frisch weitersenden, sonst läuft er bei den
  // anderen nie ab und «kein GPS» erscheint nie. Ein Alarm nimmt die letzte Position trotzdem mit.
  if (store.gpsFehler) return;
  const jetzt = Date.now();
  if (!sollSenden(jetzt, pos, letzteGesendet, intervallMs(pos), erzwingen)) return;
  // Auch ohne neuen Fix (Stillstand) wird im Intervall gesendet → Server sieht «lebt»
  if (send({ typ: 'pos', pos })) {
    letzteGesendet = { t: jetzt, pos };
    erzwingen = false;
  }
}

/** Position bei nächster Gelegenheit sofort senden (höchstens 1/s; bleibt vorgemerkt, bis Senden erlaubt ist). */
export function sendePosJetzt(): void {
  erzwingen = true;
  pruefeSenden();
}

function setzeZurueck() {
  letzteGesendet = null;
  erzwingen = false;
  posEmpfang.clear();
  store.lage = null;
  store.ich = null;
  store.teilnehmer.clear();
  store.marker.clear();
  store.sichtungen.clear();
  store.alarme.clear();
  store.chat = [];
  store.meldungen = [];
  schliesseAlle();
  ui.kontext = null;
  ui.radial = null;
}

/** Lage beendet, ich bin Leitung: Verbindung zu, Token behalten (Export/Löschen per REST). */
function nachbereitung(lage: Lage): void {
  clearTimeout(wiederTimer);
  store.beendet = true;
  const s = ws;
  ws = null;
  s?.close();
  store.verbindung = 'getrennt';
  setzeZurueck();
  store.lage = lage;
}

/** Token löschen, Verbindung schliessen, zurück zum Login. */
export function abmelden(grund?: string): void {
  clearTimeout(wiederTimer);
  store.beendet = false;
  store.token = null;
  schreibe(TOKEN_KEY, null);
  const s = ws;
  ws = null;
  s?.close();
  store.verbindung = 'getrennt';
  setzeZurueck();
  if (grund) toast(grund, 6000);
}

// --- REST ---------------------------------------------------------------------------------

async function fehlertext(r: Response): Promise<string> {
  const text = await r.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    const msg = j.fehler ?? j.meldung ?? j.error;
    if (typeof msg === 'string') return msg;
  } catch {
    /* kein JSON */
  }
  if (r.status === 401 || r.status === 403) return 'Nicht berechtigt.';
  if (r.status === 429) return 'Zu viele Versuche – bitte kurz warten.';
  return text.slice(0, 200) || `Serverfehler (${r.status})`;
}

/** fetch mit Bearer-Token. Wirft Error mit lesbarer Meldung bei !ok. */
export async function api(pfad: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (store.token) headers.set('Authorization', `Bearer ${store.token}`);
  let r: Response;
  try {
    r = await fetch(pfad, { ...init, headers });
  } catch {
    throw new Error('Server nicht erreichbar.');
  }
  if (!r.ok) throw new Error(await fehlertext(r));
  return r;
}

export async function postJson<T>(pfad: string, body: unknown): Promise<T> {
  const r = await api(pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

export function anmelden(b: Beigetreten): void {
  store.token = b.token;
  store.ich = b.teilnehmerId;
  schreibe(TOKEN_KEY, b.token);
  versuch = 0;
  verbinde();
}

/** «gerade eben», «vor 40 s», «vor 3 min», «vor 2 h» */
export function formatAlter(ms: number): string {
  if (ms < 10_000) return 'gerade eben';
  if (ms < 60_000) return `vor ${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `vor ${Math.round(ms / 60_000)} min`;
  return `vor ${Math.round(ms / 3_600_000)} h`;
}
