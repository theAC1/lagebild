import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Layer from './Layer.svelte';
import Panel from './Panel.svelte';

// Offline-Gebiete (30.10.): Kacheln für ein Rechteck vorab laden, verwalten, nach 60 Tagen ohne Nutzung löschen.
const feature: Feature = {
  id: 'offline',
  label: 'Offline-Karten',
  icon: ikon('<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M12 9v6M9.5 12.5L12 15l2.5-2.5"/>'),
  Panel,
  MapLayer: Layer,
};

export default feature;
