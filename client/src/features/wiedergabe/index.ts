import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Oeffner from './Oeffner.svelte';
import Panel from './Panel.svelte';

// Wiedergabe und Ereignisliste in der Aktionsnachbearbeitung (Spec v6).
const feature: Feature = {
  id: 'wiedergabe',
  label: 'Wiedergabe',
  icon: ikon('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z" fill="currentColor"/>'),
  Panel,
  MapLayer: Oeffner,
  phasen: ['an'],
  haupt: {}, // Daumen-Ränder: fester Randknopf (in AN fehlen Status, Melden, Alarm) statt im Mehr-Menü
};

export default feature;
