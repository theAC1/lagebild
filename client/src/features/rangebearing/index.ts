import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Panel from './Panel.svelte';
import RbLayer from './RbLayer.svelte';

const feature: Feature = {
  id: 'rangebearing',
  label: 'Range & Bearing',
  icon: ikon('<circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7 17L17 7" stroke-dasharray="2.5 2.5"/>'),
  Panel,
  MapLayer: RbLayer,
};

export default feature;
