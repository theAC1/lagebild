// Leitung: Status-Set-Entwurf, Slug, Zugangslink, gemerkte Codes, Download-Dateiname (rein, testbar).
import { z } from 'zod';
import { StatusDef, type Phase } from '../../../../shared/protocol.ts';

/** Knopf und Rückfrage je Zielphase (Spec v6); der Knopf nennt, ob es vor- oder zurückgeht. */
export const PHASE_TEXT: Record<Phase, { knopf: (von: Phase) => string; frage: string }> = {
  ap: { knopf: () => 'Zurück in die Aktionsplanung (AP)', frage: 'Zurück in die Aktionsplanung? Positionen, Status, Alarme und Bloodhound ruhen, offene Alarme und Aufträge werden aufgehoben.' },
  lv: {
    knopf: (von) => (von === 'an' ? 'Zurück in die Lageverfolgung (LV)' : 'Lageverfolgung starten (LV)'),
    frage: 'In die Lageverfolgung wechseln? Alle Geräte senden ab jetzt ihre Position.',
  },
  an: { knopf: () => 'Nachbearbeitung starten (AN)', frage: 'Mission beenden und in die Nachbearbeitung wechseln? Danach ist alles schreibgeschützt; Wiedergabe und Ereignisliste stehen allen offen.' },
};

/** Eintrag im Status-Set-Editor; key null = neu, wird beim Speichern aus dem Label abgeleitet. */
export type StatusEntwurf = { key: string | null; label: string; farbe: string };

/** «Auftrag erfüllt!» → «auftrag-erfuellt» (passt auf StatusDef.key, max. 32 Zeichen). */
export function slug(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return s || 'status';
}

/** Bestehende Keys bleiben (laufende Status der Teilnehmenden gelten weiter), neue werden eindeutig geslugt. */
export function statusSetAus(entwurf: StatusEntwurf[]): StatusDef[] {
  const vergeben = new Set(entwurf.flatMap((e) => (e.key ? [e.key] : [])));
  return entwurf.map((e) => {
    let key = e.key;
    if (!key) {
      const basis = slug(e.label);
      key = basis;
      for (let n = 2; vergeben.has(key); n++) key = `${basis.slice(0, 32 - String(n).length - 1)}-${n}`;
      vergeben.add(key);
    }
    return { key, label: e.label.trim(), farbe: e.farbe.toLowerCase() };
  });
}

const StatusSet = z.array(StatusDef).min(1, 'Mindestens ein Status nötig.').max(20, 'Höchstens 20 Status.');

/** Fehlertext oder null, wenn das Set so an den Server darf. */
export function pruefeStatusSet(set: StatusDef[]): string | null {
  if (set.some((s) => !s.label)) return 'Jeder Status braucht eine Bezeichnung.';
  if (set.some((s) => s.label.length > 40)) return 'Bezeichnung höchstens 40 Zeichen.';
  const r = StatusSet.safeParse(set);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Status-Set ungültig.');
}

/** Teilnehmer-Link für QR-Code und Weitergabe. */
export const zugangsLink = (origin: string, code: string): string => `${origin}/?code=${encodeURIComponent(code)}`;

/** localStorage-Schlüssel der beim Erstellen erhaltenen Codes (siehe Kern-Wunsch Login.svelte). */
export const codesKey = (lageId: string): string => `lagebild.codes.${lageId}`;
export type GemerkteCodes = { teilnehmerCode?: string; leitungCode?: string };

export function leseCodes(roh: string | null): GemerkteCodes {
  try {
    const j = JSON.parse(roh ?? '{}');
    const s = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{6,12}$/.test(v) ? v : undefined);
    return { teilnehmerCode: s(j?.teilnehmerCode), leitungCode: s(j?.leitungCode) };
  } catch {
    return {};
  }
}

/** Dateiname aus Content-Disposition, sonst Rückfall. */
export function dateiname(disposition: string | null, rueckfall: string): string {
  const m = /filename="?([^";]+)"?/i.exec(disposition ?? '');
  return m?.[1]?.replace(/[\\/]/g, '_') || rueckfall;
}

export function verschiebe<T>(liste: readonly T[], i: number, um: -1 | 1): T[] {
  const j = i + um;
  if (j < 0 || j >= liste.length) return [...liste];
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return neu;
}

/** «14:03:27» (Ortszeit) */
export const uhrzeit = (t: number): string => new Date(t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
