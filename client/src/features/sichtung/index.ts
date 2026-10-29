import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Panel from './Panel.svelte';
import Detail from './Detail.svelte';
import Layer from './Layer.svelte';
import { sichtungMelden } from './entwurf.svelte.ts';

const feature: Feature = {
  id: 'sichtung',
  label: 'Sichtung',
  icon: ikon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  Panel,
  MapLayer: Layer,
  Detail,
  detailArt: 'sichtung',
  haupt: { aktion: sichtungMelden },
};

export default feature;
