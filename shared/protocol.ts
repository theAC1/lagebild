// Gemeinsamer Vertrag zwischen Server und PWA. Einzige Quelle für Datenmodell und WebSocket-Nachrichten.
// Datenmodell bewusst CoT-nah (uid, Zeit, stale, lat/lon/ce, Symbol), damit eine spätere TAK-Bridge einfach bleibt.
import { z } from 'zod';

// --- Grundtypen -------------------------------------------------------------

export const Id = z.string().min(1).max(64);
export const Lat = z.number().min(-90).max(90);
export const Lon = z.number().min(-180).max(180);
export const Text = (max: number) => z.string().trim().max(max);
/** ms seit Epoch; begrenzt, damit `new Date(t).toISOString()` (Export) nie wirft. */
export const Zeit = z.number().min(0).max(8.64e15);

/** APP-6D / MIL-STD-2525D Symbol-ID (20 Ziffern), gerendert mit milsymbol. */
export const Sidc = z.string().regex(/^\d{20}$/);

export const Punkt = z.object({ lat: Lat, lon: Lon });
export type Punkt = z.infer<typeof Punkt>;

// --- Status -----------------------------------------------------------------

export const StatusDef = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  label: Text(40).min(1),
  farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type StatusDef = z.infer<typeof StatusDef>;

export const STANDARD_STATUS: StatusDef[] = [
  { key: 'bereit', label: 'Bereit', farbe: '#2e7d32' },
  { key: 'bewegung', label: 'In Bewegung', farbe: '#1565c0' },
  { key: 'stellung', label: 'In Stellung', farbe: '#00838f' },
  { key: 'halt', label: 'Halt', farbe: '#f9a825' },
  { key: 'kontakt', label: 'Feindkontakt', farbe: '#c62828' },
  { key: 'verwundet', label: 'Verwundet', farbe: '#ad1457' },
  { key: 'ausfall', label: 'Ausfall', farbe: '#424242' },
  { key: 'erfuellt', label: 'Auftrag erfüllt', farbe: '#6a1b9a' },
];

// --- Entitäten --------------------------------------------------------------

export const Rolle = z.enum(['teilnehmer', 'leitung']);
export type Rolle = z.infer<typeof Rolle>;

export const Lage = z.object({
  id: Id,
  name: Text(80).min(1),
  statusSet: z.array(StatusDef).min(1).max(20),
  erstelltAm: z.number(),
  beendetAm: z.number().nullable(),
});
export type Lage = z.infer<typeof Lage>;

export const Position = z.object({
  lat: Lat,
  lon: Lon,
  alt: z.number().nullable(), // m ü. Ellipsoid (hae)
  ce: z.number().min(0).max(100000).nullable(), // Genauigkeit in m
  kurs: z.number().min(0).max(360).nullable(),
  tempo: z.number().min(0).max(500).nullable(), // m/s
  t: Zeit, // ms seit Epoch (Gerätezeit)
  // Gültigkeitsdauer ab Empfang in ms (CoT «stale»). Sender setzt 2 × Sendeintervall + 15 s; Server begrenzt auf ≤ 5 min.
  staleNach: z.number().min(1000).max(300_000).optional(),
});
export type Position = z.infer<typeof Position>;

export const Teilnehmer = z.object({
  id: Id,
  rufname: Text(32).min(1),
  einheit: Text(32).min(1), // = Gruppe für Chat
  funktion: Text(32), // z.B. Zfhr, Grfhr, Sdt
  sidc: Sidc,
  rolle: Rolle,
  status: z.string(), // key aus Lage.statusSet
  statusText: Text(200),
  pos: Position.nullable(),
  sendetPos: z.boolean(), // false = Emission Control
  online: z.boolean(),
  zuletzt: z.number(), // Server-Zeit letzte Aktivität
});
export type Teilnehmer = z.infer<typeof Teilnehmer>;

export const Marker = z.object({
  id: Id,
  sidc: Sidc,
  lat: Lat,
  lon: Lon,
  bezeichnung: Text(60),
  notiz: Text(500),
  von: Id,
  erstelltAm: z.number(),
  geaendertAm: z.number(),
});
export type Marker = z.infer<typeof Marker>;

// --- Zeichnen & Ebenen (v2) ---------------------------------------------------

export const Ebene = z.object({
  id: Id,
  name: Text(60).min(1),
  gesperrt: z.boolean(), // gesperrt: nur Leitung darf in der Ebene zeichnen, ändern, löschen
  reihenfolge: z.number().int().min(0).max(1000),
  erstelltVon: Id,
  erstelltAm: z.number(),
});
export type Ebene = z.infer<typeof Ebene>;

/** Pro Lage automatisch angelegte Ebene «Allgemein»; die ID ist aus der Lage-ID abgeleitet. Nicht löschbar. */
export const standardEbeneId = (lageId: string): string => `${lageId}-allgemein`;
export const STANDARD_EBENE_NAME = 'Allgemein';

export const ZeichnungArt = z.enum(['linie', 'pfeil', 'flaeche', 'rechteck', 'kreis', 'freihand', 'text', 'phasenlinie', 'grenze', 'stossrichtung', 'sperre', 'raum']);
export type ZeichnungArt = z.infer<typeof ZeichnungArt>;
export const RaumArt = z.enum(['bereitstellung', 'ziel', 'sperr', 'verantwortung']);
export type RaumArt = z.infer<typeof RaumArt>;

export const Farbe = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const Stil = z.object({
  farbe: Farbe,
  breite: z.number().min(1).max(12),
  strich: z.enum(['voll', 'gestrichelt', 'gepunktet']),
  fuellung: Farbe.optional(),
  deckkraft: z.number().min(0).max(1), // Deckkraft der Füllung
});
export type Stil = z.infer<typeof Stil>;
export const STANDARD_STIL: Stil = { farbe: '#d32f2f', breite: 3, strich: 'voll', deckkraft: 0.25 };

/** Punkte je Art: [min, max]. Kreis: Mittelpunkt (+ radiusM). Rechteck: zwei gegenüberliegende Ecken. Text: Ankerpunkt. */
export const MAX_PUNKTE = 500;
export const MAX_PUNKTE_LANG = 2000; // Grenze, Freihand
export const PUNKTE_JE_ART: Record<ZeichnungArt, [number, number]> = {
  linie: [2, MAX_PUNKTE],
  pfeil: [2, MAX_PUNKTE],
  flaeche: [3, MAX_PUNKTE],
  rechteck: [2, 2],
  kreis: [1, 1],
  freihand: [2, MAX_PUNKTE_LANG],
  text: [1, 1],
  phasenlinie: [2, MAX_PUNKTE],
  grenze: [2, MAX_PUNKTE_LANG],
  stossrichtung: [2, MAX_PUNKTE],
  sperre: [2, MAX_PUNKTE],
  raum: [3, MAX_PUNKTE],
};
export const MAX_RADIUS_M = 2_000_000;

const ZeichnungKern = z.object({
  ebeneId: Id,
  art: ZeichnungArt,
  raumArt: RaumArt.optional(), // nur bei art 'raum', dort Pflicht
  punkte: z.array(Punkt).min(1).max(MAX_PUNKTE_LANG),
  radiusM: z.number().positive().max(MAX_RADIUS_M).optional(), // nur bei 'kreis', dort Pflicht
  text: Text(200), // Inhalt bei art 'text' (Pflicht), sonst leer lassen
  bezeichnung: Text(200),
  stil: Stil,
});

type ZeichnungPruefbar = z.infer<typeof ZeichnungKern>;
/** Form je Art: Punktzahl, raumArt, radiusM, text. */
function pruefeZeichnung(z_: ZeichnungPruefbar, ctx: z.RefinementCtx): void {
  const [min, max] = PUNKTE_JE_ART[z_.art];
  const n = z_.punkte.length;
  const f = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (n < min || n > max) f('punkte', min === max ? `${z_.art}: genau ${min} Punkt(e)` : `${z_.art}: ${min} bis ${max} Punkte`);
  if (z_.art === 'raum' ? !z_.raumArt : z_.raumArt !== undefined) f('raumArt', 'raumArt genau bei art raum');
  if (z_.art === 'kreis' ? z_.radiusM === undefined : z_.radiusM !== undefined) f('radiusM', 'radiusM genau bei art kreis');
  if (z_.art === 'text' && !z_.text.length) f('text', 'Text fehlt');
}

/** Zeichnung ohne Server-Felder. `id` optional (Server vergibt sie sonst), z. B. für Kopieren/Einfügen. */
export const ZeichnungInput = ZeichnungKern.extend({ id: Id.optional() }).superRefine(pruefeZeichnung);
export type ZeichnungInput = z.infer<typeof ZeichnungInput>;
/** Änderung: vollständiger neuer Inhalt (ersetzt), `id` Pflicht. Ebene darf wechseln. */
export const ZeichnungAenderung = ZeichnungKern.extend({ id: Id }).superRefine(pruefeZeichnung);
export type ZeichnungAenderung = z.infer<typeof ZeichnungAenderung>;

export const Zeichnung = ZeichnungKern.extend({ id: Id, von: Id, erstelltAm: z.number(), geaendertAm: z.number() }).superRefine(pruefeZeichnung);
export type Zeichnung = z.infer<typeof Zeichnung>;
export const MAX_ZEICHNUNGEN_JE_MSG = 100;

// --- Bloodhound-Aufträge (v2) -------------------------------------------------

/** Wie bei Range & Bearing. teilnehmer/marker/sichtung: `id` Pflicht; punkt: `punkt` Pflicht. */
export const BloodhoundZiel = z
  .object({ art: z.enum(['teilnehmer', 'marker', 'sichtung', 'punkt']), id: Id.optional(), punkt: Punkt.optional() })
  .refine((z_) => (z_.art === 'punkt' ? z_.punkt !== undefined && z_.id === undefined : z_.id !== undefined && z_.punkt === undefined), 'Ziel: id bzw. punkt passt nicht zur Art');
export type BloodhoundZiel = z.infer<typeof BloodhoundZiel>;

export const BloodhoundEnde = z.enum(['aufgehoben', 'beendet', 'erreicht']);
export type BloodhoundEnde = z.infer<typeof BloodhoundEnde>;
/** Offen = `ende === null`. Pro Empfänger höchstens ein offener Auftrag (ein neuer beendet den alten als 'aufgehoben'). */
export const BloodhoundAuftrag = z.object({
  id: Id,
  von: Id, // Leitung
  an: Id,
  ziel: BloodhoundZiel,
  erstelltAm: z.number(),
  quittiertAm: z.number().nullable(),
  ende: BloodhoundEnde.nullable(),
  endeAm: z.number().nullable(),
});
export type BloodhoundAuftrag = z.infer<typeof BloodhoundAuftrag>;

export const ChatZiel = z.discriminatedUnion('art', [
  z.object({ art: z.literal('alle') }),
  z.object({ art: z.literal('einheit'), einheit: Text(32).min(1) }),
  z.object({ art: z.literal('person'), id: Id }),
]);
export type ChatZiel = z.infer<typeof ChatZiel>;

export const Chat = z.object({
  id: Id,
  von: Id,
  an: ChatZiel,
  text: Text(1000).min(1),
  t: z.number(),
});
export type Chat = z.infer<typeof Chat>;

/** Sichtungsmeldung nach SALUTE (Size, Activity, Location, Unit, Time, Equipment). */
export const SichtungInput = z.object({
  lat: Lat,
  lon: Lon,
  sidc: Sidc,
  groesse: Text(100),
  taetigkeit: Text(200),
  einheit: Text(100),
  zeit: Zeit,
  ausruestung: Text(200),
  bemerkung: Text(500),
  vertrauen: z.enum(['bestaetigt', 'wahrscheinlich', 'unsicher']),
  fotoId: Id.nullable(), // vorher via POST /api/foto hochgeladen
});
export const Sichtung = SichtungInput.extend({ id: Id, von: Id, erstelltAm: z.number() });
export type Sichtung = z.infer<typeof Sichtung>;

export const AlarmArt = z.enum(['notfall', 'kontakt']);
export const Alarm = z.object({
  id: Id,
  art: AlarmArt,
  von: Id,
  lat: Lat.nullable(),
  lon: Lon.nullable(),
  t: z.number(),
  quittiertVon: z.array(Id),
  aufgehobenAm: z.number().nullable(),
});
export type Alarm = z.infer<typeof Alarm>;

/** Statuswechsel und Freitext-Meldungen als Log (für Nachbesprechung). */
export const Meldung = z.object({
  id: Id,
  von: Id,
  status: z.string().nullable(),
  text: Text(200),
  t: z.number(),
});
export type Meldung = z.infer<typeof Meldung>;

// --- Client → Server --------------------------------------------------------

export const ClientMsg = z.discriminatedUnion('typ', [
  z.object({ typ: z.literal('hallo'), token: z.string().min(20).max(200) }), // erste Nachricht, sonst Verbindung zu
  z.object({ typ: z.literal('pos'), pos: Position }),
  z.object({ typ: z.literal('sendetPos'), an: z.boolean() }),
  z.object({ typ: z.literal('status'), status: z.string().max(32), text: Text(200) }),
  z.object({ typ: z.literal('marker.setzen'), marker: Marker.pick({ sidc: true, lat: true, lon: true, bezeichnung: true, notiz: true }).extend({ id: Id.optional() }) }),
  z.object({ typ: z.literal('marker.loeschen'), id: Id }),
  // Zeichnen: alle dürfen; ändern/löschen nur Ersteller oder Leitung; gesperrte Ebene nur Leitung. Mehrere auf einmal (Lasso,
  // Einfügen) sind alles-oder-nichts: ein Fehler lehnt die ganze Nachricht ab.
  z.object({ typ: z.literal('zeichnung.neu'), zeichnungen: z.array(ZeichnungInput).min(1).max(MAX_ZEICHNUNGEN_JE_MSG) }),
  z.object({ typ: z.literal('zeichnung.aendern'), zeichnungen: z.array(ZeichnungAenderung).min(1).max(MAX_ZEICHNUNGEN_JE_MSG) }),
  z.object({ typ: z.literal('zeichnung.loeschen'), ids: z.array(Id).min(1).max(MAX_ZEICHNUNGEN_JE_MSG) }),
  // Ebenen verwalten: nur Leitung. Löschen entfernt auch die Zeichnungen der Ebene; die Standard-Ebene ist nicht löschbar.
  z.object({ typ: z.literal('ebene.neu'), name: Text(60).min(1), gesperrt: z.boolean().optional() }),
  z.object({ typ: z.literal('ebene.aendern'), id: Id, name: Text(60).min(1).optional(), gesperrt: z.boolean().optional(), reihenfolge: z.number().int().min(0).max(1000).optional() }),
  z.object({ typ: z.literal('ebene.loeschen'), id: Id }),
  // Bloodhound-Auftrag: auftrag/aufheben nur Leitung; quittieren/beendet/erreicht nur der Empfänger.
  z.object({ typ: z.literal('bloodhound.auftrag'), an: Id, ziel: BloodhoundZiel }),
  z.object({ typ: z.literal('bloodhound.aufheben'), id: Id }),
  z.object({ typ: z.literal('bloodhound.quittieren'), id: Id }),
  z.object({ typ: z.literal('bloodhound.beendet'), id: Id }),
  z.object({ typ: z.literal('bloodhound.erreicht'), id: Id }),
  z.object({ typ: z.literal('chat'), an: ChatZiel, text: Text(1000).min(1) }),
  z.object({ typ: z.literal('sichtung'), sichtung: SichtungInput }),
  // Position immer mitsenden, auch bei sendetPos=false (wie ATAK-Notruf). Pro Person nur ein aktiver Alarm:
  // ein neuer ersetzt den bestehenden. Solange ein eigener Alarm aktiv ist, verteilt der Server 'pos' trotz sendetPos=false.
  z.object({ typ: z.literal('alarm.ausloesen'), art: AlarmArt, pos: Position.nullable() }),
  z.object({ typ: z.literal('alarm.quittieren'), id: Id }),
  z.object({ typ: z.literal('alarm.aufheben'), id: Id }), // Auslöser oder Leitung
  // nur Leitung:
  z.object({ typ: z.literal('lage.statusSet'), statusSet: z.array(StatusDef).min(1).max(20) }),
  z.object({ typ: z.literal('lage.beenden') }),
  // neuer Teilnehmer-Code; der alte wird ungültig, bestehende Tokens bleiben. Antwort 'code' nur an die auslösende Verbindung.
  z.object({ typ: z.literal('lage.codeErneuern') }),
  z.object({ typ: z.literal('teilnehmer.entfernen'), id: Id }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// --- Server → Client --------------------------------------------------------

export type ServerMsg =
  | {
      typ: 'snapshot';
      ich: string; // eigene Teilnehmer-ID
      lage: Lage;
      teilnehmer: Teilnehmer[];
      marker: Marker[];
      chat: Chat[]; // nur für mich sichtbare
      sichtungen: Sichtung[];
      ebenen: Ebene[]; // nach reihenfolge; enthält immer die Standard-Ebene
      zeichnungen: Zeichnung[];
      bloodhound: BloodhoundAuftrag[]; // offene Aufträge: Leitung alle, sonst nur die an mich
      alarme: Alarm[]; // nicht aufgehobene
      meldungen: Meldung[]; // letzte 200
      serverZeit: number;
    }
  | { typ: 'teilnehmer'; teilnehmer: Teilnehmer }
  | { typ: 'teilnehmer.weg'; id: string }
  | { typ: 'pos'; id: string; pos: Position }
  | { typ: 'marker'; marker: Marker }
  | { typ: 'marker.geloescht'; id: string }
  | { typ: 'ebene'; ebene: Ebene } // neu oder geändert
  | { typ: 'ebene.geloescht'; id: string; zeichnungIds: string[] } // inkl. der mitgelöschten Zeichnungen
  | { typ: 'zeichnungen'; zeichnungen: Zeichnung[] } // neu oder geändert (nach id ersetzen)
  | { typ: 'zeichnungen.geloescht'; ids: string[] }
  // Auftrag neu oder geändert (quittiert/beendet/aufgehoben/erreicht, `ende` gesetzt). Nur an Leitung und Empfänger.
  | { typ: 'bloodhound'; auftrag: BloodhoundAuftrag }
  | { typ: 'chat'; chat: Chat }
  | { typ: 'sichtung'; sichtung: Sichtung }
  | { typ: 'alarm'; alarm: Alarm }
  | { typ: 'meldung'; meldung: Meldung }
  | { typ: 'lage'; lage: Lage }
  // Lage beendet oder ich wurde entfernt → Client zurück zum Login. Mit `lage`: Lage beendet, die Leitung behält
  // ihr Token für Export und Löschen (REST), aber ohne WebSocket.
  | { typ: 'beendet'; lage?: Lage }
  | { typ: 'code'; teilnehmerCode: string } // Antwort auf lage.codeErneuern
  | { typ: 'ping' } // alle PING_MS: Lebenszeichen für den Watchdog im Client
  | { typ: 'fehler'; meldung: string };

// --- REST -------------------------------------------------------------------

export const LageErstellen = z.object({ name: Text(80).min(1), erstellPasswort: z.string().min(1).max(200) });
export type LageErstellt = { lageId: string; teilnehmerCode: string; leitungCode: string };

export const Beitreten = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/),
  rufname: Text(32).min(1),
  einheit: Text(32).min(1),
  funktion: Text(32),
  sidc: Sidc,
});
export type Beigetreten = { token: string; teilnehmerId: string; lageId: string; rolle: Rolle };

/** GET /api/spuren?seit=<ms> (Bearer): gespeicherte Positionen je Teilnehmer, zeitlich aufsteigend. */
export type Spuren = Record<string, Position[]>;

/** Zeitschwellen für die Stale-Logik (Client-Darstellung). */
export const STALE_MS = 2 * 60_000; // ausgegraut, falls Position kein staleNach hat
export const STALE_MAX_MS = 5 * 60_000;
export const staleNachFuer = (intervallMs: number): number => Math.min(2 * intervallMs + 15_000, STALE_MAX_MS);
export const OFFLINE_MS = 10 * 60_000; // als offline/Geist dargestellt
/** Server sendet spätestens alle PING_MS eine Nachricht; der Client gilt nach STILLE_MS ohne Nachricht als getrennt. */
export const PING_MS = 20_000;
export const STILLE_MS = 2 * PING_MS + 5_000;
