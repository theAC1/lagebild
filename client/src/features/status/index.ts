import { OHNE_BEOBACHTER } from '../../../../shared/regeln/rollen.ts';
import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Panel from './Panel.svelte';
import Rand from './Rand.svelte';
import Toolbar from './Toolbar.svelte';
import './toast.ts';

const feature: Feature = {
  id: 'status',
  label: 'Status',
  icon: ikon('<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  Panel,
  Toolbar,
  haupt: { Knopf: Rand },
  phasen: ['lv'],
  rollen: OHNE_BEOBACHTER,
};

export default feature;
