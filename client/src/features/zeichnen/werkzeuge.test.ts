import { describe, expect, it } from 'vitest';
import { befehlFuer, istEingabe, istMehrpunkt, WERKZEUGE } from './werkzeuge.ts';

const t = (key: string, mod: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mod,
});

describe('Kürzel', () => {
  it('Buchstaben laut Spec, auch gross geschrieben', () => {
    const erwartet: Record<string, string> = { l: 'linie', p: 'flaeche', r: 'rechteck', k: 'kreis', f: 'freihand', t: 'text', m: 'messen', s: 'auswahl' };
    for (const [k, id] of Object.entries(erwartet)) {
      expect(befehlFuer(t(k))).toEqual({ typ: 'werkzeug', id });
      expect(befehlFuer(t(k.toUpperCase(), { shiftKey: true }))).toEqual({ typ: 'werkzeug', id });
    }
    expect(befehlFuer(t('x'))).toBeNull();
  });
  it('Bearbeiten-Tasten', () => {
    expect(befehlFuer(t('Delete'))).toEqual({ typ: 'loeschen' });
    expect(befehlFuer(t('Escape'))).toEqual({ typ: 'abbrechen' });
    expect(befehlFuer(t('Enter'))).toEqual({ typ: 'fertig' });
    expect(befehlFuer(t('Backspace'))).toEqual({ typ: 'punktZurueck' });
  });
  it('Ctrl/Cmd: Rückgängig, Wiederholen (Y und Shift+Z), Kopieren, Einfügen', () => {
    expect(befehlFuer(t('z', { ctrlKey: true }))).toEqual({ typ: 'rueckgaengig' });
    expect(befehlFuer(t('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ typ: 'wiederholen' });
    expect(befehlFuer(t('y', { ctrlKey: true }))).toEqual({ typ: 'wiederholen' });
    expect(befehlFuer(t('z', { metaKey: true }))).toEqual({ typ: 'rueckgaengig' });
    expect(befehlFuer(t('c', { ctrlKey: true }))).toEqual({ typ: 'kopieren' });
    expect(befehlFuer(t('v', { ctrlKey: true }))).toEqual({ typ: 'einfuegen' });
  });
  it('Browser-Kürzel bleiben frei', () => {
    expect(befehlFuer(t('l', { ctrlKey: true }))).toBeNull(); // Adressleiste
    expect(befehlFuer(t('r', { ctrlKey: true }))).toBeNull(); // Neu laden
    expect(befehlFuer(t('l', { altKey: true }))).toBeNull();
  });
  it('jedes Kürzel nur einmal vergeben', () => {
    const k = WERKZEUGE.flatMap((w) => (w.kuerzel ? [w.kuerzel] : []));
    expect(new Set(k).size).toBe(k.length);
  });
  it('Mehrpunkt-Werkzeuge enden mit Doppelklick/Enter', () => {
    expect(['linie', 'pfeil', 'flaeche', 'phasenlinie', 'sperre', 'raum-ziel', 'messen'].every((id) => istMehrpunkt(id as never))).toBe(true);
    expect(['rechteck', 'kreis', 'text', 'freihand', 'auswahl', 'lasso'].some((id) => istMehrpunkt(id as never))).toBe(false);
  });
});

describe('Eingabefeld erkennen', () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as Element;
  it('Text-Eingaben ja, Knöpfe und Regler nein', () => {
    expect(istEingabe(el('INPUT', { type: 'text' }))).toBe(true);
    expect(istEingabe(el('TEXTAREA'))).toBe(true);
    expect(istEingabe(el('SELECT'))).toBe(true);
    expect(istEingabe(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(istEingabe(el('INPUT', { type: 'range' }))).toBe(false);
    expect(istEingabe(el('BUTTON'))).toBe(false);
    expect(istEingabe(null)).toBe(false);
  });
});
