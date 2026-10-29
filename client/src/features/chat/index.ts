import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import Panel from './Panel.svelte';
import { chat } from './chat.svelte.ts';

const feature: Feature = {
  id: 'chat',
  label: 'Chat',
  icon: ikon('<path d="M4 5h16v11H9l-5 4z"/>'),
  Panel,
  badge: () => chat.gesamt,
  haupt: {},
};

export default feature;
