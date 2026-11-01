// KML 2.2 ↔ Zeichnungen (Spec v8): eine Ebene je Datei, Name aus dem Dateinamen. Militärische Zeichen tragen die
// MilX-Symbol-XML in ExtendedData `App6aXmlTxt` (FeatureTypeCode MILSYM), freie Zeichnungen (DRWING) ihre Farben als rgba.
import { STANDARD_STIL, type Punkt, type Stil, type Zeichnung, type ZeichnungArt } from '../../../../../shared/protocol.ts';
import { umriss, istGeschlossen } from '../darstellung.ts';
import { ausSymbol, ebeneAus, esc, kind, klemme, ohneUmriss, rund2, symbolExport, wert, xml, type DateiEbene, type ExportEbene, type Teil } from './milx.ts';

const alle = (el: Element, name: string): Element[] => Array.from(el.getElementsByTagNameNS('*', name));
type Farbe = { farbe: string; a: number };

/** «rgba(189, 100, 100, 0.42)» */
function vonRgba(s: string | undefined): Farbe | undefined {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s?.trim() ?? '');
  if (!m) return undefined;
  const hex = [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
  return { farbe: `#${hex}`, a: m[4] === undefined ? 1 : klemme(Number(m[4]), 0, 1) };
}
const zuRgba = (farbe: string, a: number): string => `rgba(${[1, 3, 5].map((i) => parseInt(farbe.slice(i, i + 2), 16)).join(', ')}, ${a})`;
/** KML-Farbe «aabbggrr». */
const vonKml = (s: string): Farbe | undefined =>
  /^[0-9a-f]{8}$/i.test(s) ? { farbe: `#${s.slice(6, 8)}${s.slice(4, 6)}${s.slice(2, 4)}`.toLowerCase(), a: parseInt(s.slice(0, 2), 16) / 255 } : undefined;
const zuKml = (farbe: string, a: number): string => `${Math.round(a * 255).toString(16).padStart(2, '0')}${farbe.slice(5, 7)}${farbe.slice(3, 5)}${farbe.slice(1, 3)}`.toLowerCase();

/** Stil einer freien Zeichnung: Farben aus ExtendedData (DRWING), sonst aus dem eigenen Style des Placemarks. */
function stilVon(pm: Element, daten: Map<string, string>, flaeche: boolean): Stil {
  const style = kind(pm, 'Style');
  const [ls, ps] = [kind(style, 'LineStyle'), kind(style, 'PolyStyle')];
  const linie = vonRgba(daten.get('ColorCode')) ?? vonKml(wert(ls, 'color'));
  const fuell = vonRgba(daten.get('CanvasFillColorCode') || daten.get('BackgroundColorCode')) ?? vonKml(wert(ps, 'color'));
  const breite = Math.round(Number(daten.get('WidthQty') || wert(ls, 'width')));
  const fuellung = flaeche && fuell && wert(ps, 'fill') !== '0' ? fuell.farbe : undefined;
  const ohne = ohneUmriss(linie?.farbe, fuellung);
  return {
    farbe: (ohne ? fuellung : linie?.farbe) ?? STANDARD_STIL.farbe,
    breite: klemme(breite || STANDARD_STIL.breite, 1, 12),
    strich: ohne ? 'keiner' : 'voll',
    deckkraft: fuell ? rund2(fuell.a) : STANDARD_STIL.deckkraft,
    ...(fuellung ? { fuellung } : {}),
  };
}

const koordinaten = (s: string): Punkt[] =>
  s.trim().split(/\s+/).filter(Boolean).map((c) => {
    const [lon, lat] = c.split(',').map(Number);
    return { lat, lon };
  });

/** Ein Placemark → Zeichnungen (je LineString, Polygon-Aussenring, Point eine, auch in MultiGeometry; Point nur das erste Tupel). */
function placemark(pm: Element): (Teil | string)[] {
  const daten = new Map(alle(pm, 'Data').map((d) => [d.getAttribute('name') ?? '', wert(d, 'value')]));
  const name = wert(pm, 'name').slice(0, 200);
  const symbol = daten.get('App6aXmlTxt');
  const geo: [ZeichnungArt, Element | undefined][] = [
    ...alle(pm, 'LineString').map((g): [ZeichnungArt, Element | undefined] => ['linie', alle(g, 'coordinates')[0]]),
    ...alle(pm, 'Polygon').map((g): [ZeichnungArt, Element | undefined] => ['flaeche', alle(alle(g, 'outerBoundaryIs')[0] ?? g, 'coordinates')[0]]),
    ...alle(pm, 'Point').map((g): [ZeichnungArt, Element | undefined] => ['text', alle(g, 'coordinates')[0]]),
  ];
  if (!geo.length) return [`${name || 'Placemark'} ohne Linie oder Fläche`];
  return geo.map(([art, k]): Teil | string => {
    const punkte = koordinaten(k?.textContent ?? '').slice(0, art === 'text' ? 1 : undefined);
    if (symbol) return ausSymbol(symbol, punkte);
    const stil = stilVon(pm, daten, art === 'flaeche');
    if (art === 'text') return name ? { art, punkte, text: name, bezeichnung: '', stil } : 'Punkt ohne Namen';
    return { art, punkte, text: '', bezeichnung: name, stil };
  });
}

/** .kml lesen: alle Placemarks der Datei in eine Ebene, benannt nach dem Dateinamen ohne Endung. */
export function leseKml(text: string, dateiname: string): DateiEbene {
  const w = xml(text).documentElement;
  if (w.localName !== 'kml') throw new Error('Keine KML-Datei');
  return ebeneAus(dateiname.replace(/\.[^.]*$/, ''), alle(w, 'Placemark').flatMap(placemark));
}

const daten = (felder: [string, string][]): string =>
  `<ExtendedData>${felder.map(([n, v]) => `<Data name="${n}"><value>${esc(v)}</value></Data>`).join('')}</ExtendedData>`;

function placemarkFuer(z: Zeichnung): string {
  const s = z.stil;
  const symbol = symbolExport(z);
  // Zeichnungen (G.9.*) und alles ohne Code gehen wie in der Quelle als DRWING mit Farben; die Symbol-XML immer mit
  const zeichnung = !symbol || /ID=["']G\.9\./.test(symbol);
  const extra = daten([
    ...(symbol ? [['App6aXmlTxt', symbol] as [string, string]] : []),
    ['FeatureTypeCode', zeichnung ? 'DRWING' : 'MILSYM'],
    ...(zeichnung ? [['ColorCode', zuRgba(s.strich === 'keiner' ? '#000000' : s.farbe, 1)], ...(s.fuellung ? [['CanvasFillColorCode', zuRgba(s.fuellung, s.deckkraft)]] : []), ['WidthQty', String(s.breite)]] as [string, string][] : []),
  ]);
  const style = `<Style><LineStyle><color>${zuKml(s.farbe, 1)}</color><width>${s.strich === 'keiner' ? 0 : s.breite}</width></LineStyle><PolyStyle><color>${zuKml(s.fuellung ?? s.farbe, s.deckkraft)}</color>${s.fuellung ? '' : '<fill>0</fill>'}</PolyStyle></Style>`;
  const ll = (ps: Punkt[]) => ps.map((p) => `${p.lon},${p.lat}`).join(' ');
  const ring = umriss(z);
  const geo =
    z.art === 'text'
      ? `<Point><coordinates>${ll(z.punkte)}</coordinates></Point>`
      : istGeschlossen(z.art)
        ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ll([...ring, ring[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
        : `<LineString><coordinates>${ll(z.punkte)}</coordinates></LineString>`;
  const name = z.art === 'text' ? z.text : z.bezeichnung;
  return `<Placemark>${name ? `<name>${esc(name)}</name>` : ''}${style}${extra}${geo}</Placemark>`;
}

/** Eine Ebene als .kml. */
export function schreibeKml(e: ExportEbene): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(e.name)}</name>${e.zeichnungen.map(placemarkFuer).join('')}</Document></kml>\n`;
}
