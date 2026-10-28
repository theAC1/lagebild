import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import SpurenPanel from './SpurenPanel.svelte';
import SpurenLayer from './SpurenLayer.svelte';

const feature: Feature = {
  id: 'spuren',
  label: 'Spuren',
  icon: ikon('<path d="M4 20c4-1 3-6 7-7s4-6 9-8"/><circle cx="4" cy="20" r="1.5"/>'),
  Panel: SpurenPanel,
  MapLayer: SpurenLayer,
};

export default feature;
