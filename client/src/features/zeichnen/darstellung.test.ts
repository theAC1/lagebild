import { describe, expect, it } from 'vitest';
import { STANDARD_STIL } from '../../../../shared/protocol.ts';
import { versetze } from '../../lib/coords.ts';
import { darstelle, musterBild, musterName, PX, umriss, type Form } from './darstellung.ts';
import { lokal, type Xy } from './geometrie.ts';
import { liveMasse, masse, mitStil } from './logik.ts';

const A = { lat: 46.9466, lon: 7.4442 };
const B = versetze(A, 1000, 90);
const C = versetze(B, 1000, 0);
const form = (f: Partial<Form>): Form => ({ id: 'z1', art: 'linie', punkte: [A, B], text: '', bezeichnung: '', stil: STANDARD_STIL, ...f });
const MPP = 2;
const norm = ([x, y]: Xy): Xy => [x / Math.hypot(x, y), y / Math.hypot(x, y)];

describe('Darstellung', () => {
  it('Linienarten: Phasenlinie beschriftet beide Enden, Grenze ohne Stufe durchgezogen, Sperre mit Zacken, Pfeil und Stossrichtung gefüllt', () => {
    expect(darstelle(form({ art: 'phasenlinie', bezeichnung: 'Adler' }), MPP).beschriftungen.map((b) => [b.text, b.punkt])).toEqual([['PL Adler', A], ['PL Adler', B]]);
    expect(darstelle(form({ art: 'grenze' }), MPP).features.map((f) => f.properties!.strich)).toEqual(['voll']);
    const s = darstelle(form({ art: 'sperre' }), MPP).features;
    expect(s).toHaveLength(2);
    expect((s[1].geometry as GeoJSON.LineString).coordinates).toHaveLength(55); // 1000 m / (18 px · 2 m/px) = 27 Zacken → 2·27+1
    const p = darstelle(form({ art: 'pfeil' }), MPP).features;
    expect(p).toHaveLength(2);
    expect(p[1].geometry.type).toBe('Polygon');
    expect(p[1].properties).toMatchObject({ fuellung: STANDARD_STIL.farbe, deckkraft: 1 });
    expect(darstelle(form({ art: 'stossrichtung' }), MPP).features[0].properties!.fuellung).toBe(STANDARD_STIL.farbe);
  });

  it('Grenze (Spec v8, Juan 01.11.): je ~160 px eine Lücke mit dem Verbandszeichen ohne Kästchen, Namen links/rechts der Zeichenrichtung, nie kopfüber', () => {
    const ebene = lokal(A);
    // 1000 m bei 2 m/px = 500 px → 3 Lücken; Stufe C = ●●: zwei gefüllte Punkte je Lücke, quer genau auf der Linie
    const { features } = darstelle(form({ art: 'grenze', stufe: 'C' }), MPP);
    const x = (f: GeoJSON.Feature) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : (f.geometry as GeoJSON.LineString).coordinates).map((c) => ebene.hin({ lon: c[0], lat: c[1] }));
    const punkte = features.filter((f) => f.properties!.breite === 8); // Punkt Ø 8 px: winzige Linie mit runden Enden
    const stuecke = features.filter((f) => !punkte.includes(f)).map((f) => x(f).map((p) => p[0]));
    expect(stuecke).toHaveLength(4);
    expect(punkte).toHaveLength(6);
    expect(features.every((f) => f.properties!.farbe === STANDARD_STIL.farbe && f.properties!.strich === 'voll')).toBe(true);
    const mitten = punkte.map((f) => x(f)).map((ps) => [0, 1].map((k) => (Math.min(...ps.map((p) => p[k])) + Math.max(...ps.map((p) => p[k]))) / 2));
    mitten.forEach(([, y]) => expect(Math.abs(y)).toBeLessThan(0.1));
    // Lücke und Zeichen passen: kein Punkt (Radius 4 px) näher als 4 px an einem Linienende samt runder Kappe
    for (const [mx] of mitten) for (const st of stuecke) expect(mx < Math.min(...st) - (4 + 4 + 1.5) * MPP + 0.1 || mx > Math.max(...st) + (4 + 4 + 1.5) * MPP - 0.1, `${mx}`).toBe(true);
    const l = Math.max(...stuecke.flat()); // Lücken bei 1/6, 3/6, 5/6 der Länge, die Punkte 10 px auseinander
    expect(mitten.map(([mx]) => mx)).toEqual([1, 3, 5].flatMap((k) => [(k * l) / 6 - 5 * MPP, (k * l) / 6 + 5 * MPP].map((v) => expect.closeTo(v, 2))));

    const d = (punkte = [A, B], bezeichnung = 'NORD | SÜD') => darstelle(form({ art: 'grenze', bezeichnung, punkte }), MPP).beschriftungen;
    const [links, rechts] = d(); // nach Osten gezeichnet: links = Norden
    expect([links.text, rechts.text]).toEqual(['NORD', 'SÜD']);
    const m = lokal({ lat: A.lat, lon: (A.lon + B.lon) / 2 });
    expect(m.hin(links.punkt)[1]).toBeCloseTo(PX.grenzName * MPP, 0);
    expect(m.hin(rechts.punkt)[1]).toBeCloseTo(-PX.grenzName * MPP, 0);
    expect(m.hin(d(undefined, '| SÜD')[0].punkt)[1]).toBeLessThan(0); // nur rechts (Vertrag trimmt « | SÜD»): bleibt rechts
    expect(d([B, A]).map((b) => b.drehung)).toEqual(Array(2).fill(expect.closeTo(0, 1))); // nach Westen: nicht kopfüber
    expect(d([B, C])[0].drehung).toBeCloseTo(-90, 1); // nach Norden
    expect(m.hin(d([B, A])[0].punkt)[1]).toBeLessThan(0); // nach Westen gezeichnet: links = Süden
  });

  describe('Pfeilkopf (Rückmeldung 30.10.: «passt nicht wirklich»)', () => {
    const ebene = lokal(B);
    /** Kopf in Metern um die Spitze B, Achse = Richtung A→B; Schaft-Ende ebenso. */
    function kopf(punkte: Form['punkte'], breite = STANDARD_STIL.breite) {
      const [schaft, k] = darstelle(form({ art: 'pfeil', punkte, stil: { ...STANDARD_STIL, breite } }), MPP).features;
      const xy = (c: number[]) => ebene.hin({ lon: c[0], lat: c[1] });
      const ring = (k.geometry.type === 'Polygon' ? k.geometry.coordinates[0] : (k.geometry as GeoJSON.LineString).coordinates).map(xy);
      const ende = xy((schaft.geometry as GeoJSON.LineString).coordinates.at(-1)!);
      return { ring, ende };
    }
    const r = norm(ebene.hin(A)); // von der Spitze zurück Richtung A
    const laengs = (p: Xy) => -(p[0] * r[0] + p[1] * r[1]); // < 0: hinter der Spitze
    const quer = (p: Xy) => p[0] * r[1] - p[1] * r[0];

    it('Spitze am letzten Punkt, Kopf symmetrisch dahinter, Schaft endet im Kopf, Kopf wächst mit der Strichdicke; winziges Schlussstück (Doppeltippen) dreht ihn nicht weg', () => {
      const { ring } = kopf([A, B]);
      expect(Math.min(...ring.map((p) => Math.hypot(...p)))).toBeLessThan(0.01);
      const qs = ring.filter((p) => Math.hypot(...p) > 1).map(quer);
      expect(Math.max(...qs)).toBeCloseTo(-Math.min(...qs), 3);
      expect(Math.max(...qs)).toBeGreaterThan(5);
      const daneben = versetze(B, 0.5, 0); // 0.5 m quer zur Linie, wie ein zweites Tippen an derselben Stelle
      for (const punkte of [[A, B], [A, B, B], [A, B, daneben]]) {
        const fluegel = kopf(punkte).ring.filter((p) => Math.hypot(...p) > 2);
        expect(fluegel.length, String(punkte.length)).toBeGreaterThanOrEqual(2);
        for (const p of fluegel) expect(laengs(p), String(punkte.length)).toBeLessThan(-10);
      }
      const { ende } = kopf([A, B]);
      const tiefe = Math.min(...ring.map(laengs));
      expect(laengs(ende)).toBeLessThan(-1);
      expect(laengs(ende)).toBeGreaterThan(tiefe);
      const dick = kopf([A, B], 8).ring;
      expect(Math.min(...dick.map(laengs))).toBeLessThan(tiefe);
      expect(Math.max(...dick.map(quer))).toBeGreaterThan(Math.max(...ring.map(quer)) + (8 - 3) * MPP); // mehr als der Strich selbst
    });
  });

  it('Räume: Schraffur je Art, Beschriftung mit Kürzel; Muster-Bitmap in Farbe, sonst transparent', () => {
    const br = darstelle(form({ art: 'raum', raumArt: 'bereitstellung', punkte: [A, B, C], bezeichnung: 'Nord' }), MPP);
    expect(br.features[0].properties!.muster).toBe(musterName('schraeg', STANDARD_STIL.farbe));
    expect(br.beschriftungen[0]).toMatchObject({ text: 'BR Nord', ueber: 'Bereitstellungsraum', art: 'raum' });
    expect(darstelle(form({ art: 'raum', raumArt: 'sperr', punkte: [A, B, C] }), MPP).features[0].properties!.muster).toContain('kreuz');
    const vr = darstelle(form({ art: 'raum', raumArt: 'verantwortung', punkte: [A, B, C] }), MPP).features[0].properties!;
    expect(vr.muster).toBeUndefined();
    expect(vr.strich).toBe('gestrichelt');
    const b = musterBild('schraeg', '#ff0000', 8);
    expect(b.data).toHaveLength(8 * 8 * 4);
    expect([...b.data.slice(0, 4)]).toEqual([255, 0, 0, 200]); // (0,0) liegt auf der Diagonale
    expect(b.data[(3 * 8 + 1) * 4 + 3]).toBe(0); // (1,3) leer
    const k = musterBild('kreuz', '#ff0000', 8);
    expect(k.data.filter((_, i) => i % 4 === 3 && k.data[i] > 0).length).toBeGreaterThan(b.data.filter((_, i) => i % 4 === 3 && b.data[i] > 0).length);
  });

  it('Kreis und Rechteck als Polygon, Füllung nur mit Stil.fuellung; Text nur als Beschriftung', () => {
    const k = darstelle(form({ art: 'kreis', punkte: [A], radiusM: 300 }), MPP).features[0];
    expect(k.geometry.type).toBe('Polygon');
    expect(k.properties!.fuellung).toBeUndefined();
    const r = darstelle(form({ art: 'rechteck', punkte: [A, C], stil: { ...STANDARD_STIL, fuellung: '#1565c0' } }), MPP).features[0];
    expect((r.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5);
    expect(r.properties!.fuellung).toBe('#1565c0');
    expect(umriss({ art: 'kreis', punkte: [A], radiusM: 300 }).length).toBeGreaterThan(30);
    const t = darstelle(form({ art: 'text', punkte: [A], text: 'KP' }), MPP);
    expect(t.features).toEqual([]);
    expect(t.beschriftungen).toEqual([{ id: 'z1', punkt: A, text: 'KP', art: 'text' }]);
  });
});

describe('Logik', () => {
  it('Stil ändern: Füllung in Linienfarbe folgt der Farbe, undefined entfernt sie', () => {
    const gefuellt = { ...STANDARD_STIL, fuellung: STANDARD_STIL.farbe };
    expect(mitStil(gefuellt, { farbe: '#1565c0' })).toMatchObject({ farbe: '#1565c0', fuellung: '#1565c0' });
    expect(mitStil(gefuellt, { fuellung: undefined })).not.toHaveProperty('fuellung');
    expect(mitStil(STANDARD_STIL, { breite: 6 })).toEqual({ ...STANDARD_STIL, breite: 6 });
  });
  it('Masse für Details und live beim Zeichnen', () => {
    expect(masse({ art: 'linie', punkte: [A, B] })).toEqual([{ label: 'Länge', wert: '1.00 km' }]);
    expect(masse({ art: 'kreis', punkte: [A], radiusM: 100 }).map((m) => m.wert)).toEqual(['100 m', '3.14 ha']);
    expect(masse({ art: 'flaeche', punkte: [A, B, C] }).map((m) => m.label)).toEqual(['Umfang', 'Fläche']);
    expect(masse({ art: 'text', punkte: [A] })).toEqual([]);
    expect(liveMasse('linie', [A], B)).toEqual(['Segment 1.00 km · 090° / 1600 ‰', 'Total 1.00 km']);
    expect(liveMasse('flaeche', [A, B], C).at(-1)).toBe('Fläche 50.0 ha');
    expect(liveMasse('kreis', [A], B)[0]).toBe('Radius 1.00 km');
    expect(liveMasse('rechteck', [A], C)[0]).toBe('1.00 km × 1.00 km');
    expect(liveMasse('linie', [], B)).toEqual([]);
  });
});
