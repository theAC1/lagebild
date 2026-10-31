import { describe, expect, it } from 'vitest';
import { befehlFuer, istEingabe } from './werkzeuge.ts';

const t = (key: string, mod: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mod,
});

describe('Kürzel', () => {
  it('Buchstaben laut Spec (auch gross), Bearbeiten-Tasten, Ctrl/Cmd-Befehle; Browser-Kürzel bleiben frei', () => {
    const erwartet: Record<string, string> = { l: 'linie', p: 'flaeche', r: 'rechteck', k: 'kreis', f: 'freihand', t: 'text', m: 'messen', s: 'auswahl' };
    for (const [k, id] of Object.entries(erwartet)) {
      expect(befehlFuer(t(k)), k).toEqual({ typ: 'werkzeug', id });
      expect(befehlFuer(t(k.toUpperCase(), { shiftKey: true })), k).toEqual({ typ: 'werkzeug', id });
    }
    expect(befehlFuer(t('x'))).toBeNull();
    expect(befehlFuer(t('Delete'))).toEqual({ typ: 'loeschen' });
    expect(befehlFuer(t('Escape'))).toEqual({ typ: 'abbrechen' });
    expect(befehlFuer(t('Enter'))).toEqual({ typ: 'fertig' });
    expect(befehlFuer(t('Backspace'))).toEqual({ typ: 'punktZurueck' });
    expect(befehlFuer(t('z', { ctrlKey: true }))).toEqual({ typ: 'rueckgaengig' });
    expect(befehlFuer(t('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ typ: 'wiederholen' });
    expect(befehlFuer(t('y', { ctrlKey: true }))).toEqual({ typ: 'wiederholen' });
    expect(befehlFuer(t('z', { metaKey: true }))).toEqual({ typ: 'rueckgaengig' });
    expect(befehlFuer(t('c', { ctrlKey: true }))).toEqual({ typ: 'kopieren' });
    expect(befehlFuer(t('v', { ctrlKey: true }))).toEqual({ typ: 'einfuegen' });
    expect(befehlFuer(t('l', { ctrlKey: true }))).toBeNull(); // Adressleiste
    expect(befehlFuer(t('r', { ctrlKey: true }))).toBeNull(); // Neu laden
    expect(befehlFuer(t('l', { altKey: true }))).toBeNull();
  });
  it('Eingabefeld erkennen: Text-Eingaben ja, Knöpfe und Regler nein', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as Element;
    expect(istEingabe(el('INPUT', { type: 'text' }))).toBe(true);
    expect(istEingabe(el('TEXTAREA'))).toBe(true);
    expect(istEingabe(el('SELECT'))).toBe(true);
    expect(istEingabe(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(istEingabe(el('INPUT', { type: 'range' }))).toBe(false);
    expect(istEingabe(el('BUTTON'))).toBe(false);
    expect(istEingabe(null)).toBe(false);
  });
});
