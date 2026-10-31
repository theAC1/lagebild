import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import MarkerPanel from './MarkerPanel.svelte';
import MarkerLayer from './MarkerLayer.svelte';
import MarkerDetail from './MarkerDetail.svelte';
import { markerSchnell } from './schnell.ts';

const feature: Feature = {
  id: 'marker',
  label: 'Marker',
  icon: ikon('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  Panel: MarkerPanel,
  MapLayer: MarkerLayer,
  Detail: MarkerDetail,
  detailArt: 'marker',
  haupt: { aktion: markerSchnell },
  phasen: ['ap', 'lv'],
};

export default feature;
