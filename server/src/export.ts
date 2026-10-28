// Export einer Lage als GPX 1.1 (trk je Teilnehmer, wpt für Marker/Sichtungen) und GeoJSON.
import type { Lage, Marker, Sichtung, Spuren, Teilnehmer } from '../../shared/protocol.ts';

export type ExportDaten = { lage: Lage; teilnehmer: Teilnehmer[]; marker: Marker[]; sichtungen: Sichtung[]; spuren: Spuren };

const xml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
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
  for (const m of d.marker) s += wpt(m.lat, m.lon, m.erstelltAm, m.bezeichnung || 'Marker', m.notiz, `marker ${m.sidc}`);
  for (const x of d.sichtungen) s += wpt(x.lat, x.lon, x.zeit, sichtungName(x), salute(x), `sichtung ${x.sidc}`);
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
    properties: { lage: d.lage.name, erstelltAm: d.lage.erstelltAm, beendetAm: d.lage.beendetAm },
    features: [
      ...spuren,
      ...d.marker.map(({ lat, lon, ...m }) => punkt(lat, lon, { art: 'marker', ...m })),
      ...d.sichtungen.map(({ lat, lon, ...s }) => punkt(lat, lon, { art: 'sichtung', ...s })),
    ],
  };
}
