import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Panel from './Panel.svelte';

// Meldungslog (Statuswechsel und Freitext aller); stand bis v2 im Status-Panel.
const feature: Feature = {
  id: 'meldungen',
  label: 'Meldungslog',
  icon: ikon('<path d="M5 4h14v16H5z"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>'),
  Panel,
};

export default feature;
