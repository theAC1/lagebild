// Gemeinsamer Vertrag zwischen Server und PWA. Einzige Quelle für Datenmodell und WebSocket-Nachrichten.
// Datenmodell bewusst CoT-nah (uid, Zeit, stale, lat/lon/ce, Symbol), damit eine spätere TAK-Bridge einfach bleibt.
import { z } from 'zod';

/** Hauptversion dieses Vertrags. Erhöhen, wenn ältere Stände nicht mehr mit neueren zusammenarbeiten; steht im Live-Update
 *  (web.json, gesiegelt) und in Einstellungen › Über. */
export const PROTOKOLL_VERSION = 1;

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

// --- Geländetaufe: Familien und Namenslisten (30.10.) ---------------------------

/** Namensfamilien nach CH-Armee-Praxis: Gebäude = Metalle/Elemente/Edelsteine, Strassen = Tiere, Gewässer = Wassertiere … */
export const TaufFamilie = z.enum(['gebaeude', 'strasse', 'gewaesser', 'wald', 'flaeche']);
export type TaufFamilie = z.infer<typeof TaufFamilie>;
export const TAUF_FAMILIEN: TaufFamilie[] = TaufFamilie.options;
export const MAX_TAUFNAMEN_JE_FAMILIE = 200;
export const TaufName = Text(40).min(1);
/** Namensliste je Familie; pro Lage durch die Leitung anpassbar (fehlt eine Familie, gilt die Vorgabe). */
export const TaufListen = z.partialRecord(TaufFamilie, z.array(TaufName).max(MAX_TAUFNAMEN_JE_FAMILIE));
export type TaufListen = z.infer<typeof TaufListen>;
/** Vorgabe je Familie (Juans Muster, ergänzt; gut funkbar, nicht zu nah am NATO-Alphabet). */
export const STANDARD_TAUFNAMEN: Record<TaufFamilie, string[]> = {
  gebaeude: ['Gold', 'Copper', 'Fluor', 'Alu', 'Bronce', 'Helium', 'Iridium', 'Jod', 'Kalium', 'Radium', 'Lithium', 'Diamond', 'Emerald', 'Mangan', 'Nickel', 'Osmium', 'Platinum', 'Queck Silver', 'Iron', 'Zinc', 'Cobalt', 'Chrome', 'Titan', 'Neon', 'Argon', 'Uran', 'Ruby', 'Saphir', 'Topas', 'Jade', 'Opal', 'Quartz'],
  strasse: ['Jaguar', 'Horse', 'Goat', 'Elephant', 'Deer', 'Fox', 'Camel', 'Bear', 'Ape', 'Ibex', 'Lion', 'Tiger', 'Wolf', 'Badger', 'Moose', 'Bison', 'Panther', 'Rhino', 'Hyena', 'Zebra', 'Beaver', 'Lynx', 'Puma', 'Buffalo', 'Gorilla', 'Leopard', 'Donkey', 'Rabbit', 'Marmot', 'Cheetah', 'Koala'],
  gewaesser: ['Fish', 'Whale', 'Dolphin', 'Shark', 'Seal', 'Otter', 'Pike', 'Trout', 'Salmon', 'Eel', 'Crab', 'Squid', 'Orca', 'Walrus', 'Octopus', 'Turtle', 'Frog', 'Carp', 'Perch', 'Tuna', 'Ray', 'Lobster', 'Shrimp', 'Jellyfish', 'Beluga', 'Manatee', 'Penguin', 'Pelican', 'Swan', 'Heron'],
  wald: ['Forest', 'Woods', 'Grove', 'Timber', 'Jungle', 'Thicket', 'Pines', 'Birch', 'Oak', 'Maple', 'Cedar', 'Spruce', 'Larch', 'Beech', 'Rowan', 'Elm', 'Willow', 'Poplar', 'Fir', 'Yew', 'Cypress', 'Bamboo', 'Hazel', 'Alder', 'Linden', 'Chestnut', 'Juniper', 'Redwood', 'Palm', 'Bush'],
  flaeche: ['Floor', 'Field', 'Weed', 'Ruins', 'Plaza', 'Yard', 'Meadow', 'Desert', 'Steppe', 'Prairie', 'Square', 'Court', 'Arena', 'Garden', 'Park', 'Pasture', 'Swamp', 'Marsh', 'Dune', 'Beach', 'Quarry', 'Crater', 'Valley', 'Canyon', 'Plateau', 'Savanna', 'Tundra', 'Oasis', 'Gravel', 'Pitch'],
};
/** Vergleichsschlüssel für die Eindeutigkeit von Taufnamen (über alle Familien einer Lage, ohne Gross-/Kleinschreibung). */
export const taufSchluessel = (name: string): string => name.trim().toLocaleLowerCase('de-CH').replace(/\s+/g, ' ');

// --- Entitäten --------------------------------------------------------------

export const Rolle = z.enum(['teilnehmer', 'leitung']);
export type Rolle = z.infer<typeof Rolle>;

/** Phasen einer Lage (Spec v6): AP Aktionsplanung (vor der Mission), LV Lageverfolgung (während), AN Aktionsnachbearbeitung. */
export const Phase = z.enum(['ap', 'lv', 'an']);
export type Phase = z.infer<typeof Phase>;
export const PhasenWechsel = z.object({ phase: Phase, t: z.number() });
export type PhasenWechsel = z.infer<typeof PhasenWechsel>;
export const MAX_PHASENWECHSEL = 200;

export const Lage = z.object({
  id: Id,
  name: Text(80).min(1),
  statusSet: z.array(StatusDef).min(1).max(20),
  erstelltAm: z.number(),
  /** Phasenverlauf, aufsteigend; der letzte Eintrag ist die aktuelle Phase (ersetzt `beendetAm`, 31.10.). */
  phasen: z.array(PhasenWechsel).min(1).max(MAX_PHASENWECHSEL),
  taufListen: TaufListen.optional(), // Geländetaufe: angepasste Namenslisten der Leitung
});
export type Lage = z.infer<typeof Lage>;
export const phaseVon = (l: Pick<Lage, 'phasen'>): Phase => l.phasen[l.phasen.length - 1].phase;

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

/** Zeichnung ohne Server-Felder. `id` optional (Server vergibt sie sonst), z. B. für Kopieren/Einfügen.
 * `von`: nur die Leitung darf es setzen (Rückgängig nach Löschen einer fremden Zeichnung behält den Ersteller). */
export const ZeichnungInput = ZeichnungKern.extend({ id: Id.optional(), von: Id.optional() }).superRefine(pruefeZeichnung);
export type ZeichnungInput = z.infer<typeof ZeichnungInput>;
/** Änderung: vollständiger neuer Inhalt (ersetzt), `id` Pflicht. Ebene darf wechseln. */
export const ZeichnungAenderung = ZeichnungKern.extend({ id: Id }).superRefine(pruefeZeichnung);
export type ZeichnungAenderung = z.infer<typeof ZeichnungAenderung>;

export const Zeichnung = ZeichnungKern.extend({ id: Id, von: Id, erstelltAm: z.number(), geaendertAm: z.number() }).superRefine(pruefeZeichnung);
export type Zeichnung = z.infer<typeof Zeichnung>;
export const MAX_ZEICHNUNGEN_JE_MSG = 100;
/** Grösste WebSocket-Nachricht (Bytes); grössere schliesst der Server. Grenze/Freihand mit 2000 Punkten sind ~100 KB. */
export const MAX_NACHRICHT = 256 * 1024;

// --- Geländetaufe (30.10.) ---------------------------------------------------

/** GeoJSON-Position [lon, lat]. */
export const TaufPos = z.tuple([Lon, Lat]);
const TaufRing = z.array(TaufPos).min(4);
/** Kopie der Geometrie (Kachelstücke zusammengefügt oder gezeichnet), GeoJSON in WGS84. */
export const TaufGeometrie = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: z.array(TaufPos).min(2) }),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(TaufPos).min(2)).min(1).max(200) }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(TaufRing).min(1).max(200) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(TaufRing).min(1).max(200)).min(1).max(200) }),
]);
export type TaufGeometrie = z.infer<typeof TaufGeometrie>;
/** Höchstens so viele Stützpunkte je Taufe (der Client vereinfacht grosse Wälder vorher). */
export const MAX_TAUF_PUNKTE = 5000;
export const taufPunkte = (g: TaufGeometrie): number =>
  g.type === 'LineString' ? g.coordinates.length : g.type === 'MultiPolygon' ? g.coordinates.flat(2).length : g.coordinates.flat().length;
const geometrieBegrenzt = TaufGeometrie.refine((g) => taufPunkte(g) <= MAX_TAUF_PUNKTE, `Höchstens ${MAX_TAUF_PUNKTE} Punkte je Taufe`);

/** Fassadenfarbe: Zutritt (dem Angreifer zugewandt) weiss, Rückseite schwarz, links in Stossrichtung rot, rechts grün. */
export const Fassade = z.enum(['weiss', 'schwarz', 'rot', 'gruen']);
export type Fassade = z.infer<typeof Fassade>;

const TaufeKern = z.object({
  familie: TaufFamilie,
  name: TaufName,
  geometrie: geometrieBegrenzt,
  quelle: z.enum(['vt', 'gezeichnet']), // vt = swisstopo-Vektorkachel (ch.swisstopo.base.vt)
  objektart: Text(60), // Layer/Klasse der Vorlage, z.B. 'building/roof', 'transportation/track'
  /** Stossrichtung in Grad (0 = Nord, im Uhrzeigersinn): Richtung, in die angegriffen wird; null = keine. */
  stoss: z.number().min(0).lt(360).nullable(),
  /** Umgefärbte Fassaden: [Kantenindex im Umriss, Farbe]; übersteuert die aus der Stossrichtung berechnete Farbe. */
  fassaden: z.array(z.tuple([z.number().int().min(0).max(MAX_TAUF_PUNKTE), Fassade])).max(500),
  ziel: z.boolean(), // «Zielobjekt»: hervorgehoben (gelbes Namenskästchen)
});
export const TaufeInput = TaufeKern;
export type TaufeInput = z.infer<typeof TaufeInput>;
/** Änderung: nur gesetzte Felder; Familie und Quelle bleiben. */
export const TaufeAenderung = TaufeKern.pick({ name: true, geometrie: true, objektart: true, stoss: true, fassaden: true, ziel: true }).partial().extend({ id: Id });
export type TaufeAenderung = z.infer<typeof TaufeAenderung>;
export const Taufe = TaufeKern.extend({ id: Id, von: Id, erstelltAm: z.number(), geaendertAm: z.number() });
export type Taufe = z.infer<typeof Taufe>;

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

// --- Führungsraster (v4) -------------------------------------------------------

/** Je Lage höchstens ein Raster je Art: Grande = Area of Interest (Achsen, Anfahrten), Piccolo = Area of Operation (Objekt). */
export const RasterArt = z.enum(['grande', 'piccolo']);
export type RasterArt = z.infer<typeof RasterArt>;
export const RASTER_MAX_ZEILEN = 26; // A–Z
export const RASTER_MAX_SPALTEN = 99; // 01–99
export const RASTER_MAX_AUSDEHNUNG_M = 100_000;
/** Rechteck parallel zum LV95-Gitter (nordausgerichtet, ungedreht); e/n = LV95 der Ecke oben links in m. */
const RasterKern = z.object({
  art: RasterArt,
  e: z.number().min(2_400_000).max(2_900_000),
  n: z.number().min(1_000_000).max(1_400_000),
  zeilen: z.number().int().min(1).max(RASTER_MAX_ZEILEN),
  spalten: z.number().int().min(1).max(RASTER_MAX_SPALTEN),
  zellM: z.number().min(1).max(5000),
});
const pruefeRaster = (r: z.infer<typeof RasterKern>, ctx: z.RefinementCtx): void => {
  if (Math.max(r.zeilen, r.spalten) * r.zellM > RASTER_MAX_AUSDEHNUNG_M) ctx.addIssue({ code: 'custom', path: ['zellM'], message: 'Raster zu gross' });
};
export const RasterDef = RasterKern.superRefine(pruefeRaster);
export type RasterDef = z.infer<typeof RasterDef>;
/** Vom Server vergeben: id = rasterId(lageId, art); fixiert = für alle fest, nur die Leitung löst es. */
export const Raster = RasterKern.extend({ id: Id, fixiert: z.boolean(), von: Id, geaendertAm: z.number() }).superRefine(pruefeRaster);
export type Raster = z.infer<typeof Raster>;
export const rasterId = (lageId: string, art: RasterArt): string => `${lageId}-raster-${art}`;

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
  /** Nur diese Personen (und die Leitung) bekommen den Eintrag; ohne Angabe alle. */
  nur: z.array(Id).max(2).optional(),
});
export type Meldung = z.infer<typeof Meldung>;

/** Debriefing-Notiz der Leitung (nur in AN), an einem Zeitpunkt der Wiedergabe. */
export const MAX_NOTIZEN_JE_LAGE = 500;
export const Notiz = z.object({ id: Id, von: Id, t: Zeit, text: Text(500).min(1), erstelltAm: z.number() });
export type Notiz = z.infer<typeof Notiz>;

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
  // Geländetaufe: alle dürfen taufen, umbenennen, Stossrichtung/Fassaden ändern, löschen. Namen sind je Lage eindeutig.
  z.object({ typ: z.literal('taufe.neu'), taufe: TaufeInput }),
  z.object({ typ: z.literal('taufe.aendern'), taufe: TaufeAenderung }),
  z.object({ typ: z.literal('taufe.loeschen'), id: Id }),
  z.object({ typ: z.literal('lage.taufListen'), taufListen: TaufListen }), // nur Leitung
  // Bloodhound-Auftrag: auftrag/aufheben nur Leitung; quittieren/beendet/erreicht nur der Empfänger.
  z.object({ typ: z.literal('bloodhound.auftrag'), an: Id, ziel: BloodhoundZiel }),
  z.object({ typ: z.literal('bloodhound.aufheben'), id: Id }),
  z.object({ typ: z.literal('bloodhound.quittieren'), id: Id }),
  z.object({ typ: z.literal('bloodhound.beendet'), id: Id }),
  z.object({ typ: z.literal('bloodhound.erreicht'), id: Id }),
  // Führungsraster: erstellen alle (je Art eins); nicht fixiert ändern/fixieren/löschen Ersteller oder Leitung;
  // fixiert nur noch die Leitung (lösen, löschen; ändern erst nach dem Lösen).
  z.object({ typ: z.literal('raster.setzen'), raster: RasterDef }),
  z.object({ typ: z.literal('raster.fixieren'), art: RasterArt, fixiert: z.boolean() }),
  z.object({ typ: z.literal('raster.loeschen'), art: RasterArt }),
  z.object({ typ: z.literal('chat'), an: ChatZiel, text: Text(1000).min(1) }),
  z.object({ typ: z.literal('sichtung'), sichtung: SichtungInput }),
  // Position immer mitsenden, auch bei sendetPos=false (wie ATAK-Notruf). Pro Person nur ein aktiver Alarm:
  // ein neuer ersetzt den bestehenden. Solange ein eigener Alarm aktiv ist, verteilt der Server 'pos' trotz sendetPos=false.
  z.object({ typ: z.literal('alarm.ausloesen'), art: AlarmArt, pos: Position.nullable() }),
  z.object({ typ: z.literal('alarm.quittieren'), id: Id }),
  z.object({ typ: z.literal('alarm.aufheben'), id: Id }), // Auslöser oder Leitung
  // nur Leitung:
  z.object({ typ: z.literal('lage.statusSet'), statusSet: z.array(StatusDef).min(1).max(20) }),
  // Phase wechseln (AP↔LV, LV↔AN); verlässt die Lage LV, hebt der Server offene Alarme und Bloodhound-Aufträge auf.
  z.object({ typ: z.literal('lage.phase'), phase: Phase }),
  // Debriefing-Notizen: nur in AN
  z.object({ typ: z.literal('notiz.neu'), t: Zeit, text: Text(500).min(1) }),
  z.object({ typ: z.literal('notiz.loeschen'), id: Id }),
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
      taufen: Taufe[];
      bloodhound: BloodhoundAuftrag[]; // offene Aufträge: für alle
      raster: Raster[]; // Führungsraster der Lage (höchstens Grande und Piccolo)
      alarme: Alarm[]; // nicht aufgehobene
      meldungen: Meldung[]; // letzte 200
      notizen: Notiz[]; // Debriefing (AN)
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
  | { typ: 'taufe'; taufe: Taufe } // neu oder geändert
  | { typ: 'taufe.geloescht'; id: string }
  // Auftrag neu oder geändert (quittiert/beendet/aufgehoben/erreicht, `ende` gesetzt). Nur an Leitung und Empfänger.
  | { typ: 'bloodhound'; auftrag: BloodhoundAuftrag }
  | { typ: 'raster'; raster: Raster } // neu oder geändert
  | { typ: 'raster.geloescht'; art: RasterArt }
  | { typ: 'chat'; chat: Chat }
  | { typ: 'sichtung'; sichtung: Sichtung }
  | { typ: 'alarm'; alarm: Alarm }
  | { typ: 'meldung'; meldung: Meldung }
  | { typ: 'notiz'; notiz: Notiz }
  | { typ: 'notiz.geloescht'; id: string }
  | { typ: 'lage'; lage: Lage }
  // Lage gelöscht oder ich wurde entfernt → Client zurück zum Login.
  | { typ: 'beendet' }
  | { typ: 'code'; teilnehmerCode: string } // Antwort auf lage.codeErneuern
  | { typ: 'ping' } // alle PING_MS: Lebenszeichen für den Watchdog im Client
  | { typ: 'fehler'; meldung: string };

// --- REST -------------------------------------------------------------------

/** `phase`: Startphase. Vorgabe LV: ältere Web-Stände senden keine Phase und könnten AP nicht verlassen; der Client sendet 'ap'. */
export const LageErstellen = z.object({ name: Text(80).min(1), erstellPasswort: z.string().min(1).max(200), phase: Phase.exclude(['an']).optional() });
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

/** Ereignisprotokoll (Spec v6): Deltas der Regeln mit Zeit und Autor, ohne Positionen, Teilnehmer und Lage. */
export type ProtokollEintrag = { t: number; von: string; d: ServerMsg };
/**
 * GET /api/protokoll?seit=<t>&max=<n> (Bearer): eine Seite, Ereignisse mit t > seit (ohne seit: von Anfang), höchstens
 * max (Vorgabe und Höchstwert MAX_PROTOKOLL_SEITE). `weiter`: seit für die nächste Seite, null am Ende. Chat/Meldungen gefiltert wie live.
 */
export type ProtokollSeite = { teilnehmer: Teilnehmer[]; ereignisse: ProtokollEintrag[]; weiter: number | null };
export const MAX_PROTOKOLL_SEITE = 5000;
/** Grundlage von Wiedergabe und Ereignisliste in AN: alle Seiten, dazu die Spuren aus GET /api/spuren. */
export type Protokoll = { teilnehmer: Teilnehmer[]; ereignisse: ProtokollEintrag[]; spuren: Spuren };
const OHNE_PROTOKOLL = new Set<ServerMsg['typ']>(['snapshot', 'teilnehmer', 'pos', 'lage', 'beendet', 'code', 'ping', 'fehler', 'notiz', 'notiz.geloescht']);
export const imProtokoll = (d: ServerMsg): boolean => !OHNE_PROTOKOLL.has(d.typ);

/** Zeitschwellen für die Stale-Logik (Client-Darstellung). */
export const STALE_MS = 2 * 60_000; // ausgegraut, falls Position kein staleNach hat
export const STALE_MAX_MS = 5 * 60_000;
export const staleNachFuer = (intervallMs: number): number => Math.min(2 * intervallMs + 15_000, STALE_MAX_MS);
export const OFFLINE_MS = 10 * 60_000; // als offline/Geist dargestellt
/** Server sendet spätestens alle PING_MS eine Nachricht; der Client gilt nach STILLE_MS ohne Nachricht als getrennt. */
export const PING_MS = 20_000;
export const STILLE_MS = 2 * PING_MS + 5_000;
