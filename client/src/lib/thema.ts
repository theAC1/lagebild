// Tag/Nacht automatisch nach Sonnenstand (Spec v3): kein Schalter, App prüft minütlich (siehe App.svelte).
import { kartenMitte } from './map.ts';
import { istTag } from './sonne.ts';
import { store } from './store.svelte.ts';

const META = { tag: '#e9e8de', nacht: '#12140e' };

/** Setzt data-thema auf <html>: eigene Position, ohne GPS die Kartenmitte; ohne beides bleibt das Thema. */
export function pruefeThema(): void {
  const ort = store.meinePos ?? kartenMitte();
  if (!ort) return;
  const thema = istTag(ort, Date.now()) ? 'tag' : 'nacht';
  document.documentElement.dataset.thema = thema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[thema]);
}
