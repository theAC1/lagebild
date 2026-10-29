import { describe, expect, it } from 'vitest';
import { ClientMsg, MAX_NACHRICHT, STANDARD_STIL } from '../../../../shared/protocol.ts';
import { MAX_VERLAUF, nachrichten, stuecke, Verlauf, type ZInhalt } from './verlauf.ts';

const z = (id: string, lat = 47): ZInhalt => ({
  id,
  ebeneId: 'L-allgemein',
  art: 'linie',
  punkte: [{ lat, lon: 7 }, { lat, lon: 7.1 }],
  text: '',
  bezeichnung: '',
  stil: STANDARD_STIL,
});

describe('Verlauf', () => {
  it('neu → rückgängig löscht, wiederholen legt mit derselben ID neu an', () => {
    const v = new Verlauf();
    v.tue({ typ: 'neu', zeichnungen: [z('a')] });
    expect(v.rueckgaengig()!.msgs).toEqual([{ typ: 'zeichnung.loeschen', ids: ['a'] }]);
    expect(v.kannZurueck).toBe(false);
    expect(v.wiederholen()!.msgs).toEqual([{ typ: 'zeichnung.neu', zeichnungen: [z('a')] }]);
    expect(v.kannVor).toBe(false);
  });
  it('ändern → rückgängig sendet die alte Fassung', () => {
    const v = new Verlauf();
    v.tue({ typ: 'aendern', vorher: [z('a', 47)], nachher: [z('a', 46)] });
    expect(v.rueckgaengig()!.msgs).toEqual([{ typ: 'zeichnung.aendern', zeichnungen: [z('a', 47)] }]);
    expect(v.wiederholen()!.msgs).toEqual([{ typ: 'zeichnung.aendern', zeichnungen: [z('a', 46)] }]);
  });
  it('löschen → rückgängig legt neu an', () => {
    expect(nachrichten({ typ: 'loeschen', zeichnungen: [z('a')] }, 'zurueck')).toEqual([{ typ: 'zeichnung.neu', zeichnungen: [z('a')] }]);
  });
  it('Reihenfolge: zuletzt Getanes zuerst zurück; neue Aktion verwirft Wiederholen', () => {
    const v = new Verlauf();
    v.tue({ typ: 'neu', zeichnungen: [z('a')] });
    v.tue({ typ: 'neu', zeichnungen: [z('b')] });
    expect(v.rueckgaengig()!.msgs[0]).toMatchObject({ ids: ['b'] });
    v.tue({ typ: 'neu', zeichnungen: [z('c')] });
    expect(v.kannVor).toBe(false);
    expect(v.rueckgaengig()!.msgs[0]).toMatchObject({ ids: ['c'] });
    expect(v.rueckgaengig()!.msgs[0]).toMatchObject({ ids: ['a'] });
    expect(v.rueckgaengig()).toBeNull();
  });
  it('abgelehnter Eintrag fliegt ganz raus', () => {
    const v = new Verlauf();
    const e = { typ: 'neu' as const, zeichnungen: [z('a')] };
    v.tue(e);
    v.entferne(e);
    expect(v.kannZurueck || v.kannVor).toBe(false);
  });
  it('höchstens MAX_VERLAUF Schritte', () => {
    const v = new Verlauf();
    for (let i = 0; i < MAX_VERLAUF + 5; i++) v.tue({ typ: 'neu', zeichnungen: [z(`x${i}`)] });
    let n = 0;
    while (v.rueckgaengig()) n++;
    expect(n).toBe(MAX_VERLAUF);
  });
  it('mehr als 100 Zeichnungen: in gültige Listen-Nachrichten aufgeteilt', () => {
    const viele = Array.from({ length: 250 }, (_, i) => z(`z${i}`));
    const msgs = nachrichten({ typ: 'neu', zeichnungen: viele }, 'vor');
    expect(msgs.map((m) => (m.typ === 'zeichnung.neu' ? m.zeichnungen.length : 0))).toEqual([100, 100, 50]);
    for (const m of [...msgs, ...nachrichten({ typ: 'neu', zeichnungen: viele }, 'zurueck')]) expect(ClientMsg.safeParse(m).success).toBe(true);
    expect(stuecke([], 100)).toEqual([]);
  });
  it('grosse Zeichnungen (Kopieren mehrerer Freihand-Linien): jede Nachricht bleibt unter der Servergrenze', () => {
    const punkte = Array.from({ length: 2000 }, (_, i) => ({ lat: -46.123456789012 - i / 1e6, lon: -7.123456789012 - i / 1e6 }));
    const gross = Array.from({ length: 6 }, (_, i) => ({ ...z(`f${i}`), art: 'freihand' as const, punkte }));
    const msgs = nachrichten({ typ: 'neu', zeichnungen: gross }, 'vor');
    expect(msgs.length).toBeGreaterThan(1);
    expect(msgs.flatMap((m) => (m.typ === 'zeichnung.neu' ? m.zeichnungen.map((x) => x.id) : []))).toEqual(gross.map((x) => x.id));
    for (const m of msgs) expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThan(MAX_NACHRICHT);
  });
});
