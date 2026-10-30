import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import { RASTER_NAME } from '../../../../shared/raster.ts';
import Panel from './Panel.svelte';
import RasterLayer from './RasterLayer.svelte';
import { ARTEN, rz, schalteSichtbar, sichtbar } from './zustand.svelte.ts';

const feature: Feature = {
  id: 'raster',
  label: 'Führungsraster',
  icon: ikon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
  Panel,
  MapLayer: RasterLayer,
  // Ebenen-Auswahl: je vorhandenes Raster ein Schalter, pro Gerät gemerkt
  ebenen: () => ARTEN.filter((a) => rz.raster.has(a)).map((a) => ({ label: RASTER_NAME[a], an: sichtbar(a), schalten: () => schalteSichtbar(a) })),
};

export default feature;
