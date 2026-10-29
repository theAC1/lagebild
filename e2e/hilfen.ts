// Gemeinsame Hilfen der E2E-Tests (keine Testdatei: testMatch ist *.e2e.ts).

/**
 * Init-Script für context.addInitScript(bedienung, 'klassisch'): setzt die Bedienung, solange keine gewählt ist.
 * Andere Einstellungen (z.B. die per Tippen gemerkte Koordinatenzeile) bleiben über Neuladen erhalten.
 */
export function bedienung(b: 'klassisch' | 'daumen'): void {
  const k = 'lagebild.einstellungen';
  const e = JSON.parse(localStorage.getItem(k) ?? '{}');
  if (!e.bedienung) localStorage.setItem(k, JSON.stringify({ ...e, bedienung: b }));
}
