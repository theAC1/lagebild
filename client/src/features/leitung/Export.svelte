<script lang="ts">
  import { api, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { dateiname } from './logik.ts';

  const FORMATE = [
    { ext: 'gpx', label: 'GPX', text: 'Spuren und Wegpunkte (Marker, Sichtungen) – für GPS-Programme und Karten-Apps.' },
    { ext: 'geojson', label: 'GeoJSON', text: 'Alle Geodaten mit Eigenschaften – für QGIS und Auswertungen.' },
  ] as const;

  let laeuft = $state<string | null>(null);

  async function exportiere(ext: 'gpx' | 'geojson') {
    laeuft = ext;
    try {
      const r = await api(`/api/export.${ext}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = dateiname(r.headers.get('Content-Disposition'), `lage-${store.lage?.erstelltAm ?? 'export'}.${ext}`);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast(`Export fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      laeuft = null;
    }
  }
</script>

<p class="leise">Exportiert die ganze Lage mit allen gespeicherten Positionen, auch von entfernten Teilnehmenden.</p>
<div class="formate">
  {#each FORMATE as f (f.ext)}
    <button class="format" disabled={laeuft !== null} onclick={() => exportiere(f.ext)}>
      <strong>{laeuft === f.ext ? 'Wird erstellt …' : `${f.label} herunterladen`}</strong>
      <span class="leise">{f.text}</span>
    </button>
  {/each}
</div>

<style>
  .formate {
    display: grid;
    gap: 8px;
  }
  .format {
    display: grid;
    gap: 2px;
    padding: 10px 14px;
    text-align: left;
  }
</style>
