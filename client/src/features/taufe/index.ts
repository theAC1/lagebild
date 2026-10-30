import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Detail from './Detail.svelte';
import Panel from './Panel.svelte';
import TaufeLayer from './TaufeLayer.svelte';

const feature: Feature = {
  id: 'taufe',
  label: 'Geländetaufe',
  // Namensschild mit Fähnchen
  icon: ikon('<path d="M5 21V4"/><path d="M5 4h11l-2 3.5 2 3.5H5"/><path d="M9 17h10"/>'),
  Panel,
  MapLayer: TaufeLayer,
  Detail,
  detailArt: 'taufe',
};

export default feature;
