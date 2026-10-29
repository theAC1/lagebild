// Icons der Werkzeuge (getrennt von werkzeuge.ts, damit die reine Logik ohne Svelte-Laufzeit testbar bleibt).
import { ikon } from '../../lib/ui.svelte.ts';
import type { WerkzeugId } from './werkzeuge.ts';

const raumIcon = (innen: string) => ikon(`<path d="M4 6l7-3 9 4-2 11-12 2z"/>${innen}`);

export const IKON: Record<WerkzeugId, string> = {
  'auswahl': ikon('<path d="M5 3l13 8-6 1.5L9 19z"/>'),
  'lasso': ikon('<path d="M6 15c-3-2-2-7 4-9s11 0 10 4-7 6-11 5"/><path d="M8 15c-1 2 0 4 2 5" stroke-dasharray="2 2"/>'),
  'messen': ikon('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
  'linie': ikon('<path d="M4 18l6-9 5 5 5-9"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="5" r="1.5"/>'),
  'pfeil': ikon('<path d="M4 20L19 5M11 5h8v8"/>'),
  'flaeche': ikon('<path d="M5 18L4 7l9-4 7 7-5 9z" fill="currentColor" fill-opacity=".25"/>'),
  'rechteck': ikon('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  'kreis': ikon('<circle cx="12" cy="12" r="8"/><path d="M12 12h8"/><circle cx="12" cy="12" r="1"/>'),
  'freihand': ikon('<path d="M3 17c3-6 5 2 8-3s3-8 6-6-1 9 4 9"/>'),
  'text': ikon('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  'phasenlinie': ikon('<path d="M3 15c5-4 13-4 18 0"/><text x="2" y="9" font-size="7" stroke="none" fill="currentColor" font-weight="700">PL</text>'),
  'grenze': ikon('<path d="M3 12h5M11 12h1M15 12h6"/><path d="M10 7v10M14 7v10" stroke-width="1.5"/>'),
  'stossrichtung': ikon('<path d="M3 15h11v4l7-7-7-7v4H3z"/>'),
  'sperre': ikon('<path d="M3 16h18"/><path d="M3 16l3-6 3 6 3-6 3 6 3-6 3 6"/>'),
  'raum-bereitstellung': raumIcon('<path d="M8 15l6-8M11 17l6-8" stroke-width="1.2"/>'),
  'raum-ziel': raumIcon('<circle cx="12" cy="11" r="2.5"/>'),
  'raum-sperr': raumIcon('<path d="M8 8l8 8M16 8l-8 8" stroke-width="1.2"/>'),
  'raum-verantwortung': ikon('<path d="M4 6l7-3 9 4-2 11-12 2z" stroke-dasharray="3 2"/>'),
};

export const IKON_FANG = ikon('<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>');
export const IKON_ZURUECK = ikon('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>');
export const IKON_VOR = ikon('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>');
export const IKON_ZEICHNEN = ikon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>');
