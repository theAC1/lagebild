// Zeichnung → GeoJSON für die MapLibre-Layer und HTML-Beschriftungen (der Kartenstil hat keine Glyphen).
// Eigene Umsetzung, angelehnt an APP-6D: Phasenlinie, Grenze, Stossrichtung, Sperre, Räume mit Schraffur.
import type { Punkt, RaumArt, Stil, Stufe, Zeichnung, ZeichnungArt } from '../../../../shared/protocol.ts';
import { kreisRing, lokal, linienMitte, mittelpunkt, mitteQuer, pfeil, rechteckRing, stosspfeil, unterbrochen, zacken, type Xy } from './geometrie.ts';

/** Was gezeichnet wird – Zeichnung, Entwurf oder Vorschau. */
export type Form = Pick<Zeichnung, 'id' | 'art' | 'punkte' | 'text' | 'bezeichnung' | 'stil'> & Partial<Pick<Zeichnung, 'raumArt' | 'radiusM' | 'stufe'>>;

export type Strich = Stil['strich'];
export type Muster = 'schraeg' | 'kreuz';
/** `drehung`: Grad im Uhrzeigersinn, dreht mit der Karte (Schrift entlang einer Linie). */
export type Beschriftung = { id: string; punkt: Punkt; text: string; ueber?: string; art: 'text' | 'pl' | 'raum' | 'linie' | 'grenze'; drehung?: number };

/** Zwei Namen einer Grenze in `bezeichnung`: links und rechts der Zeichenrichtung (MilX-Attribute T und T1). */
export const GRENZE_TRENNER = ' | ';
/** Am ersten «|» getrennt: der Vertrag trimmt, aus « | RECHTS» (nur rechts) wird «| RECHTS». */
export const grenzNamen = (bez: string): [string, string] => {
  const i = bez.indexOf('|');
  return i < 0 ? [bez.trim(), ''] : [bez.slice(0, i).trim(), bez.slice(i + 1).trim()];
};
/** Zwei Namen → `bezeichnung`; «|» in einem Namen wird «/». */
export const grenzBezeichnung = (links: string, rechts: string): string => {
  const [l, r] = [links, rechts].map((n) => n.replaceAll('|', '/').trim());
  return r ? `${l}${GRENZE_TRENNER}${r}` : l;
};
/** Führungsstufen nach APP-6A (Stelle 12): Verbandszeichen in den Lücken der Grenze. */
export const STUFE: Record<Stufe, { zeichen: string; name: string }> = {
  A: { zeichen: 'Ø', name: 'Trupp' }, B: { zeichen: '●', name: 'Gruppe' }, C: { zeichen: '●●', name: 'Sektion' }, D: { zeichen: '●●●', name: 'Zug' },
  E: { zeichen: 'I', name: 'Kompanie' }, F: { zeichen: 'II', name: 'Bataillon' }, G: { zeichen: 'III', name: 'Regiment' }, H: { zeichen: 'X', name: 'Brigade' },
  I: { zeichen: 'XX', name: 'Division' }, J: { zeichen: 'XXX', name: 'Korps' }, K: { zeichen: 'XXXX', name: 'Armee' }, L: { zeichen: 'XXXXX', name: 'Heeresgruppe' },
  M: { zeichen: 'XXXXXX', name: 'Region' },
};

export const RAUM: Record<RaumArt, { label: string; kurz: string; muster?: Muster; strich: Strich }> = {
  bereitstellung: { label: 'Bereitstellungsraum', kurz: 'BR', muster: 'schraeg', strich: 'voll' },
  ziel: { label: 'Zielraum', kurz: 'ZIEL', strich: 'voll' },
  sperr: { label: 'Sperrraum', kurz: 'SPERR', muster: 'kreuz', strich: 'voll' },
  verantwortung: { label: 'Verantwortungsraum', kurz: 'VR', strich: 'gestrichelt' },
};

const GESCHLOSSEN: ReadonlySet<ZeichnungArt> = new Set(['flaeche', 'rechteck', 'kreis', 'raum']);
export const istGeschlossen = (art: ZeichnungArt): boolean => GESCHLOSSEN.has(art);

/** Umriss in Kartenkoordinaten: Ring für Kreis/Rechteck, sonst die Stützpunkte. */
export function umriss(f: Pick<Form, 'art' | 'punkte' | 'radiusM'>): Punkt[] {
  if (f.art === 'kreis') return kreisRing(f.punkte[0], f.radiusM ?? 1);
  if (f.art === 'rechteck' && f.punkte.length === 2) return rechteckRing(f.punkte[0], f.punkte[1]);
  return f.punkte;
}

const ll = (p: Punkt): [number, number] => [p.lon, p.lat];
const ring = (ps: Punkt[]): [number, number][] => [...ps.map(ll), ll(ps[0])];

type Props = { id: string; farbe: string; breite: number; strich: Strich; fuellung?: string; deckkraft: number; muster?: string };

const linie = (ps: Punkt[], p: Props): GeoJSON.Feature => ({ type: 'Feature', properties: p, geometry: { type: 'LineString', coordinates: ps.map(ll) } });
const polygon = (ps: Punkt[], p: Props): GeoJSON.Feature => ({ type: 'Feature', properties: p, geometry: { type: 'Polygon', coordinates: [ring(ps)] } });

/** Name des Füllmusters für map.addImage (eine Bitmap je Muster und Farbe). */
export const musterName = (m: Muster, farbe: string): string => `zeichnen-${m}-${farbe.slice(1).toLowerCase()}`;

/** Grössen der Zeichen in Bildschirmpixeln (über `mpp` in Meter umgerechnet → bleiben beim Zoomen lesbar). */
export const PX = { spitze: 14, zackenAbstand: 18, zackenHoehe: 9, stoss: 26, grenzName: 16, verband: 160 };

/** Verbandszeichen je Schriftzeichen in px (x entlang der Linie, y quer): Breite, Striche, Punkt (Ø 8 px). */
const PUNKT = 8;
const KREIS = Array.from({ length: 12 }, (_, i): Xy => [4 * Math.cos((i * Math.PI) / 6), 4 * Math.sin((i * Math.PI) / 6)]);
const GLYPHE: Record<string, { b: number; striche: Xy[][]; punkt?: true }> = {
  '●': { b: 10, striche: [], punkt: true },
  'Ø': { b: 12, striche: [[...KREIS, KREIS[0]], [[-5, -5], [5, 5]]] },
  I: { b: 6, striche: [[[0, -5.5], [0, 5.5]]] },
  X: { b: 10, striche: [[[-3.5, -5.5], [3.5, 5.5]], [[-3.5, 5.5], [3.5, -5.5]]] },
};

/**
 * GeoJSON-Features und Beschriftungen einer Form. `mpp` = Meter je Pixel (aktueller Zoom).
 * Linien-Layer zeichnen auch Polygon-Ränder; der Füll-Layer nimmt nur Features mit `fuellung`.
 */
export function darstelle(f: Form, mpp: number): { features: GeoJSON.Feature[]; beschriftungen: Beschriftung[] } {
  const s = f.stil;
  const basis: Props = { id: f.id, farbe: s.farbe, breite: s.breite, strich: s.strich, deckkraft: s.deckkraft, ...(s.fuellung ? { fuellung: s.fuellung } : {}) };
  const features: GeoJSON.Feature[] = [];
  const beschriftungen: Beschriftung[] = [];
  const bez = f.bezeichnung.trim();
  const mitBez = (p: Punkt, art: Beschriftung['art'] = 'linie') => bez && beschriftungen.push({ id: f.id, punkt: p, text: bez, art });
  const ps = f.punkte;
  if (!ps.length) return { features, beschriftungen };
  const ebene = lokal(ps[0]);
  const zurueck = (xs: Xy[]) => xs.map(ebene.zurueck);
  const achse = () => ps.map(ebene.hin);

  switch (f.art) {
    case 'text':
      beschriftungen.push({ id: f.id, punkt: ps[0], text: f.text || '…', art: 'text' });
      break;
    case 'kreis':
    case 'rechteck':
    case 'flaeche': {
      const r = umriss(f);
      if (r.length >= 3) {
        features.push(polygon(r, basis));
        mitBez(mittelpunkt(r), 'raum');
      } else if (r.length === 2) features.push(linie(r, basis));
      break;
    }
    case 'raum': {
      const def = RAUM[f.raumArt ?? 'bereitstellung'];
      const p: Props = { ...basis, strich: def.strich, breite: f.raumArt === 'ziel' ? s.breite + 1 : s.breite, ...(def.muster ? { muster: musterName(def.muster, s.farbe) } : {}) };
      if (ps.length >= 3) {
        features.push(polygon(ps, p));
        beschriftungen.push({ id: f.id, punkt: mittelpunkt(ps), ueber: def.label, text: bez ? `${def.kurz} ${bez}` : def.kurz, art: 'raum' });
      } else features.push(linie(ps, p));
      break;
    }
    case 'pfeil': {
      // Kopf als gefülltes Dreieck, wächst mit der Strichdicke; ohne Länge (erster Punkt im Entwurf) nur die Linie
      const l = (PX.spitze + 3 * s.breite) * mpp;
      const p = ps.length >= 2 ? pfeil(achse(), l, 0.45 * l) : null;
      if (p) features.push(linie(zurueck(p.schaft), basis), polygon(zurueck(p.kopf), { ...basis, strich: 'voll', breite: 1, fuellung: s.farbe, deckkraft: 1 }));
      else features.push(linie(ps, basis));
      mitBez(linienMitte(ps));
      break;
    }
    case 'phasenlinie':
      features.push(linie(ps, { ...basis, strich: 'voll' }));
      if (ps.length >= 2) {
        const t = bez ? `PL ${bez}` : 'PL';
        beschriftungen.push({ id: f.id, punkt: ps[0], text: t, art: 'pl' }, { id: f.id, punkt: ps.at(-1)!, text: t, art: 'pl' });
      }
      break;
    case 'grenze': {
      // Juan 01.11.: durchgezogen; mit Stufe in regelmässigen Abständen unterbrochen, in jeder Lücke das Verbandszeichen
      // in Linienfarbe ohne Kästchen (●● Sektion, ●●● Zug, I Kompanie …); die Namen je auf einer Seite entlang der Linie
      const voll: Props = { ...basis, strich: 'voll' };
      const zeichen = f.stufe ? [...STUFE[f.stufe].zeichen].map((c) => GLYPHE[c]) : [];
      const breite = zeichen.reduce((n, g) => n + g.b, 0);
      // Lücke: Zeichen + je 4 px Rand + runde Linienenden
      const { stuecke, luecken } = zeichen.length && ps.length >= 2 ? unterbrochen(achse(), PX.verband * mpp, (breite + 8 + s.breite) * mpp) : { stuecke: [achse()], luecken: [] };
      for (const st of stuecke) features.push(linie(zurueck(st), voll));
      for (const { p, r } of luecken) {
        let u = -breite / 2;
        for (const g of zeichen) {
          const c = u + g.b / 2; // Zeichenmitte entlang der Linie (px ab Lückenmitte)
          const hin = ([x, y]: Xy): Xy => [p[0] + ((c + x) * r[0] - y * r[1]) * mpp, p[1] + ((c + x) * r[1] + y * r[0]) * mpp];
          for (const st of g.striche) features.push(linie(zurueck(st.map(hin)), { ...voll, breite: 2 }));
          // Punkt = 1 px kurzes Stück mit runden Enden (kürzere verwirft geojson-vt): liegt wie die Linie über allen
          // Füllungen und hat ihren Saum
          if (g.punkt) features.push(linie(zurueck([hin([-0.5, 0]), hin([0.5, 0])]), { ...voll, breite: PUNKT }));
          u += g.b;
        }
      }
      if (ps.length < 2) break;
      const q = mitteQuer(achse(), PX.grenzName * mpp);
      const [l, r] = grenzNamen(bez);
      const an = (xy: Xy, text: string) => beschriftungen.push({ id: f.id, punkt: ebene.zurueck(xy), text, art: 'grenze', drehung: q.drehung });
      if (l) an(q.links, l);
      if (r) an(q.rechts, r);
      break;
    }
    case 'sperre':
      features.push(linie(ps, basis));
      if (ps.length >= 2) features.push(linie(zurueck(zacken(achse(), PX.zackenAbstand * mpp, PX.zackenHoehe * mpp)), { ...basis, strich: 'voll' }));
      mitBez(linienMitte(ps));
      break;
    case 'stossrichtung':
      if (ps.length >= 2) features.push(polygon(zurueck(stosspfeil(achse(), PX.stoss * mpp)), { ...basis, strich: 'voll', fuellung: s.fuellung ?? s.farbe }));
      mitBez(linienMitte(ps));
      break;
    default: // linie, freihand
      features.push(linie(ps, basis));
      mitBez(linienMitte(ps));
  }
  return { features, beschriftungen };
}

/** RGBA-Bitmap für fill-pattern: diagonale Schraffur (schraeg) oder Kreuzschraffur (kreuz), Hintergrund transparent. */
export function musterBild(m: Muster, farbe: string, groesse = 12): { width: number; height: number; data: Uint8Array } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(farbe.slice(i, i + 2), 16));
  const data = new Uint8Array(groesse * groesse * 4);
  for (let y = 0; y < groesse; y++) {
    for (let x = 0; x < groesse; x++) {
      const an = (x + y) % groesse < 2 || (m === 'kreuz' && (x - y + groesse) % groesse < 2);
      if (!an) continue;
      const i = (y * groesse + x) * 4;
      data.set([r, g, b, 200], i);
    }
  }
  return { width: groesse, height: groesse, data };
}
