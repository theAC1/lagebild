// Export einer Lage als GPX 1.1 (trk je Teilnehmer, wpt für Marker/Sichtungen) und GeoJSON.
import type { Ebene, Lage, Marker, Punkt, Raster, Sichtung, Spuren, Teilnehmer, Zeichnung } from '../../shared/protocol.ts';
import { rahmen, RASTER_NAME } from '../../shared/raster.ts';

export type ExportDaten = { lage: Lage; teilnehmer: Teilnehmer[]; marker: Marker[]; sichtungen: Sichtung[]; ebenen: Ebene[]; zeichnungen: Zeichnung[]; raster: Raster[]; spuren: Spuren };

const xml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const ERDRADIUS = 6371008.8;
/** Kreis als Ring (geschlossen) für GeoJSON. */
function kreisRing(m: Punkt, radiusM: number, n = 48): number[][] {
  const d = radiusM / ERDRADIUS;
  const la = (m.lat * Math.PI) / 180;
  const ring = Array.from({ length: n + 1 }, (_, i) => {
    const az = (2 * Math.PI * (i % n)) / n;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(az));
    const lon2 = (m.lon * Math.PI) / 180 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
    return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  });
  return ring;
}
const schliesse = (r: number[][]): number[][] => [...r, r[0]];
const koord = (p: Punkt): number[] => [p.lon, p.lat];
/** Ecken eines Rechtecks aus zwei gegenüberliegenden Punkten (geschlossen). */
const rechteckRing = ([a, b]: Punkt[]): number[][] => schliesse([[a.lon, a.lat], [b.lon, a.lat], [b.lon, b.lat], [a.lon, b.lat]]);

function zeichnungGeometrie(z: Zeichnung): object {
  switch (z.art) {
    case 'kreis': return { type: 'Polygon', coordinates: [kreisRing(z.punkte[0], z.radiusM!)] };
    case 'text': return { type: 'Point', coordinates: koord(z.punkte[0]) };
    case 'rechteck': return { type: 'Polygon', coordinates: [rechteckRing(z.punkte)] };
    case 'flaeche':
    case 'raum': return { type: 'Polygon', coordinates: [schliesse(z.punkte.map(koord))] };
    default: return { type: 'LineString', coordinates: z.punkte.map(koord) };
  }
}

const iso = (t: number): string => new Date(t).toISOString();

const salute = (s: Sichtung): string =>
  [
    `Grösse: ${s.groesse}`,
    `Tätigkeit: ${s.taetigkeit}`,
    `Einheit: ${s.einheit}`,
    `Zeit: ${iso(s.zeit)}`,
    `Ausrüstung: ${s.ausruestung}`,
    `Bemerkung: ${s.bemerkung}`,
    `Vertrauen: ${s.vertrauen}`,
  ].join('\n');

const sichtungName = (s: Sichtung): string => `Sichtung ${s.einheit || s.groesse || ''}`.trim();

function wpt(lat: number, lon: number, t: number, name: string, desc: string, typ: string): string {
  return `  <wpt lat="${lat}" lon="${lon}"><time>${iso(t)}</time><name>${xml(name)}</name><desc>${xml(desc)}</desc><type>${typ}</type></wpt>\n`;
}

export function gpx(d: ExportDaten): string {
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Lagebild" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  s += `  <metadata><name>${xml(d.lage.name)}</name><time>${iso(d.lage.erstelltAm)}</time></metadata>\n`;
  // GPX 1.1 verlangt die Reihenfolge wpt*, rte*, trk*
  let wpts = '';
  let rtes = '';
  let trks = '';
  for (const m of d.marker) wpts += wpt(m.lat, m.lon, m.erstelltAm, m.bezeichnung || 'Marker', m.notiz, `marker ${m.sidc}`);
  for (const x of d.sichtungen) wpts += wpt(x.lat, x.lon, x.zeit, sichtungName(x), salute(x), `sichtung ${x.sidc}`);
  const ebeneName = (id: string): string => d.ebenen.find((e) => e.id === id)?.name ?? '';
  const zname = (z: Zeichnung): string => z.bezeichnung || z.text || z.art;
  // Linienartige als Route, Freihand als Track, Flächen als geschlossene Route, Text und Kreismittelpunkt als Wegpunkt
  for (const z of d.zeichnungen) {
    const typ = `zeichnung ${z.art}${z.raumArt ? ` ${z.raumArt}` : ''}`;
    const desc = [z.text, ebeneName(z.ebeneId) && `Ebene: ${ebeneName(z.ebeneId)}`, z.radiusM !== undefined && `Radius: ${Math.round(z.radiusM)} m`].filter(Boolean).join('\n');
    if (z.art === 'text' || z.art === 'kreis') {
      wpts += wpt(z.punkte[0].lat, z.punkte[0].lon, z.erstelltAm, zname(z), desc, typ);
      continue;
    }
    const pts = z.art === 'rechteck' ? rechteckRing(z.punkte).map(([lon, lat]) => ({ lat, lon })) : z.art === 'flaeche' || z.art === 'raum' ? [...z.punkte, z.punkte[0]] : z.punkte;
    if (z.art === 'freihand') {
      trks += `  <trk><name>${xml(zname(z))}</name><desc>${xml(desc)}</desc><type>${typ}</type><trkseg>\n`;
      for (const p of pts) trks += `    <trkpt lat="${p.lat}" lon="${p.lon}"/>\n`;
      trks += `  </trkseg></trk>\n`;
    } else {
      rtes += `  <rte><name>${xml(zname(z))}</name><desc>${xml(desc)}</desc><type>${typ}</type>\n`;
      for (const p of pts) rtes += `    <rtept lat="${p.lat}" lon="${p.lon}"/>\n`;
      rtes += `  </rte>\n`;
    }
  }
  s += wpts + rtes + trks;
  for (const t of d.teilnehmer) {
    const punkte = d.spuren[t.id];
    if (!punkte?.length) continue;
    s += `  <trk><name>${xml(t.rufname)}</name><desc>${xml(`${t.einheit} ${t.funktion}`.trim())}</desc><trkseg>\n`;
    for (const p of punkte)
      s += `    <trkpt lat="${p.lat}" lon="${p.lon}">${p.alt === null ? '' : `<ele>${p.alt}</ele>`}<time>${iso(p.t)}</time></trkpt>\n`;
    s += `  </trkseg></trk>\n`;
  }
  return s + '</gpx>\n';
}

export function geojson(d: ExportDaten): object {
  const spuren = d.teilnehmer.flatMap((t) => {
    const punkte = d.spuren[t.id];
    if (!punkte?.length) return [];
    const koord = punkte.map((p) => (p.alt === null ? [p.lon, p.lat] : [p.lon, p.lat, p.alt]));
    return [
      {
        type: 'Feature',
        geometry: koord.length > 1 ? { type: 'LineString', coordinates: koord } : { type: 'Point', coordinates: koord[0] },
        properties: { art: 'spur', teilnehmerId: t.id, rufname: t.rufname, einheit: t.einheit, funktion: t.funktion, sidc: t.sidc, zeiten: punkte.map((p) => p.t) },
      },
    ];
  });
  const punkt = (lat: number, lon: number, properties: object) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });
  return {
    type: 'FeatureCollection',
    properties: { lage: d.lage.name, erstelltAm: d.lage.erstelltAm, beendetAm: d.lage.beendetAm, ebenen: d.ebenen },
    features: [
      ...spuren,
      ...d.marker.map(({ lat, lon, ...m }) => punkt(lat, lon, { art: 'marker', ...m })),
      ...d.sichtungen.map(({ lat, lon, ...s }) => punkt(lat, lon, { art: 'sichtung', ...s })),
      ...d.zeichnungen.map((z) => ({
        type: 'Feature',
        geometry: zeichnungGeometrie(z),
        properties: { art: 'zeichnung', form: z.art, raumArt: z.raumArt, radiusM: z.radiusM, mittelpunkt: z.art === 'kreis' ? z.punkte[0] : undefined, text: z.text, bezeichnung: z.bezeichnung, stil: z.stil, ebeneId: z.ebeneId, ebene: d.ebenen.find((e) => e.id === z.ebeneId)?.name, id: z.id, von: z.von, erstelltAm: z.erstelltAm, geaendertAm: z.geaendertAm },
      })),
      // Rahmen als Fläche; Zellen ergeben sich aus e/n (LV95 oben links), zeilen, spalten, zellM (shared/raster.ts)
      ...d.raster.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [rahmen(r).map(koord)] },
        properties: { art: 'fuehrungsraster', raster: r.art, name: RASTER_NAME[r.art], lv95: { e: r.e, n: r.n }, zeilen: r.zeilen, spalten: r.spalten, zellM: r.zellM, fixiert: r.fixiert, id: r.id, von: r.von, geaendertAm: r.geaendertAm },
      })),
    ],
  };
}
