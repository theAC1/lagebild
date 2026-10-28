import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Panel from './Panel.svelte';
import Toolbar from './Toolbar.svelte';

const feature: Feature = {
  id: 'status',
  label: 'Status',
  icon: ikon('<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  Panel,
  Toolbar,
};

export default feature;
