import { describe, expect, it } from 'vitest';
import { STANDARD_STIL, Zeichnung, type Ebene } from '../../../../shared/protocol.ts';
import { versetze } from '../../lib/coords.ts';
import { darstelle, musterBild, musterName, umriss, type Form } from './darstellung.ts';
import { darfAendern, liveMasse, masse, zuInhalt } from './logik.ts';

const A = { lat: 46.9466, lon: 7.4442 };
const B = versetze(A, 1000, 90);
const C = versetze(B, 1000, 0);
const form = (f: Partial<Form>): Form => ({ id: 'z1', art: 'linie', punkte: [A, B], text: '', bezeichnung: '', stil: STANDARD_STIL, ...f });
const MPP = 2;

describe('Darstellung', () => {
  it('Linie: ein LineString mit Stil-Eigenschaften', () => {
    const { features, beschriftungen } = darstelle(form({}), MPP);
    expect(features).toHaveLength(1);
    expect(features[0].geometry.type).toBe('LineString');
    expect(features[0].properties).toMatchObject({ id: 'z1', farbe: STANDARD_STIL.farbe, strich: 'voll', breite: 3 });
    expect(beschriftungen).toEqual([]);
  });
  it('Phasenlinie: «PL Name» an beiden Enden', () => {
    const { beschriftungen } = darstelle(form({ art: 'phasenlinie', bezeichnung: 'Adler' }), MPP);
    expect(beschriftungen.map((b) => [b.text, b.punkt])).toEqual([
      ['PL Adler', A],
      ['PL Adler', B],
    ]);
  });
  it('Grenze: Strich-Punkt; Sperre: Grundlinie plus Zacken', () => {
    expect(darstelle(form({ art: 'grenze' }), MPP).features[0].properties!.strich).toBe('strichpunkt');
    const s = darstelle(form({ art: 'sperre' }), MPP).features;
    expect(s).toHaveLength(2);
    // 1000 m / (18 px · 2 m/px) = 27 Zacken → 2·27+1 Punkte
    expect((s[1].geometry as GeoJSON.LineString).coordinates).toHaveLength(55);
  });
  it('Pfeil: Linie plus Spitze; Stossrichtung: gefüllter Umriss', () => {
    const p = darstelle(form({ art: 'pfeil' }), MPP).features;
    expect(p).toHaveLength(2);
    expect((p[1].geometry as GeoJSON.LineString).coordinates[1]).toEqual([B.lon, B.lat]);
    const s = darstelle(form({ art: 'stossrichtung' }), MPP).features[0];
    expect(s.geometry.type).toBe('Polygon');
    expect(s.properties!.fuellung).toBe(STANDARD_STIL.farbe);
  });
  it('Räume: Schraffur je Art, Beschriftung mit Kürzel in der Fläche', () => {
    const br = darstelle(form({ art: 'raum', raumArt: 'bereitstellung', punkte: [A, B, C], bezeichnung: 'Nord' }), MPP);
    expect(br.features[0].properties!.muster).toBe(musterName('schraeg', STANDARD_STIL.farbe));
    expect(br.beschriftungen[0]).toMatchObject({ text: 'BR Nord', ueber: 'Bereitstellungsraum', art: 'raum' });
    expect(darstelle(form({ art: 'raum', raumArt: 'sperr', punkte: [A, B, C] }), MPP).features[0].properties!.muster).toContain('kreuz');
    const vr = darstelle(form({ art: 'raum', raumArt: 'verantwortung', punkte: [A, B, C] }), MPP).features[0].properties!;
    expect(vr.muster).toBeUndefined();
    expect(vr.strich).toBe('gestrichelt');
  });
  it('Kreis und Rechteck als Polygon; Füllung nur mit Stil.fuellung', () => {
    const k = darstelle(form({ art: 'kreis', punkte: [A], radiusM: 300 }), MPP).features[0];
    expect(k.geometry.type).toBe('Polygon');
    expect(k.properties!.fuellung).toBeUndefined();
    const r = darstelle(form({ art: 'rechteck', punkte: [A, C], stil: { ...STANDARD_STIL, fuellung: '#1565c0' } }), MPP).features[0];
    expect((r.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5);
    expect(r.properties!.fuellung).toBe('#1565c0');
    expect(umriss({ art: 'kreis', punkte: [A], radiusM: 300 }).length).toBeGreaterThan(30);
  });
  it('Text nur als Beschriftung', () => {
    const t = darstelle(form({ art: 'text', punkte: [A], text: 'KP' }), MPP);
    expect(t.features).toEqual([]);
    expect(t.beschriftungen).toEqual([{ id: 'z1', punkt: A, text: 'KP', art: 'text' }]);
  });
  it('Muster-Bitmap: richtige Grösse und Farbe, sonst transparent', () => {
    const b = musterBild('schraeg', '#ff0000', 8);
    expect(b.data).toHaveLength(8 * 8 * 4);
    expect([...b.data.slice(0, 4)]).toEqual([255, 0, 0, 200]); // (0,0) liegt auf der Diagonale
    expect(b.data[(3 * 8 + 1) * 4 + 3]).toBe(0); // (1,3) leer
    const k = musterBild('kreuz', '#ff0000', 8);
    expect(k.data.filter((_, i) => i % 4 === 3 && k.data[i] > 0).length).toBeGreaterThan(b.data.filter((_, i) => i % 4 === 3 && b.data[i] > 0).length);
  });
});

describe('Logik', () => {
  const ebenen = new Map<string, Ebene>([
    ['offen', { id: 'offen', name: 'Offen', gesperrt: false, reihenfolge: 0, erstelltVon: 's', erstelltAm: 0 }],
    ['zu', { id: 'zu', name: 'Zu', gesperrt: true, reihenfolge: 1, erstelltVon: 's', erstelltAm: 0 }],
  ]);
  it('Rechte: Ersteller in offener Ebene, Leitung immer', () => {
    expect(darfAendern({ von: 'ich', ebeneId: 'offen' }, 'ich', false, ebenen)).toBe(true);
    expect(darfAendern({ von: 'du', ebeneId: 'offen' }, 'ich', false, ebenen)).toBe(false);
    expect(darfAendern({ von: 'ich', ebeneId: 'zu' }, 'ich', false, ebenen)).toBe(false);
    expect(darfAendern({ von: 'du', ebeneId: 'zu' }, 'ich', true, ebenen)).toBe(true);
  });
  it('zuInhalt: nur Vertragsfelder, gültig als Änderung', () => {
    const z: Zeichnung = { ...form({ art: 'kreis', punkte: [A], radiusM: 50 }), ebeneId: 'offen', von: 'ich', erstelltAm: 1, geaendertAm: 2 };
    const i = zuInhalt(z);
    expect(i).not.toHaveProperty('von');
    expect(i).not.toHaveProperty('raumArt');
    expect(i.radiusM).toBe(50);
  });
  it('Masse für Details', () => {
    expect(masse({ art: 'linie', punkte: [A, B] })).toEqual([{ label: 'Länge', wert: '1.00 km' }]);
    expect(masse({ art: 'kreis', punkte: [A], radiusM: 100 }).map((m) => m.wert)).toEqual(['100 m', '3.14 ha']);
    expect(masse({ art: 'flaeche', punkte: [A, B, C] }).map((m) => m.label)).toEqual(['Umfang', 'Fläche']);
    expect(masse({ art: 'text', punkte: [A] })).toEqual([]);
  });
  it('Live-Masse: Segment mit Richtung, Total, Fläche für geschlossene Formen', () => {
    expect(liveMasse('linie', [A], B)).toEqual(['Segment 1.00 km · 090° / 1600 ‰', 'Total 1.00 km']);
    expect(liveMasse('flaeche', [A, B], C).at(-1)).toBe('Fläche 50.0 ha');
    expect(liveMasse('kreis', [A], B)[0]).toBe('Radius 1.00 km');
    expect(liveMasse('rechteck', [A], C)[0]).toBe('1.00 km × 1.00 km');
    expect(liveMasse('linie', [], B)).toEqual([]);
  });
});
