<script lang="ts">
  import { schliesse, oeffne, ui } from '../../lib/ui.svelte.ts';
</script>

<button class="alarm-knopf" aria-label="Alarm auslösen" onclick={() => (ui.panel?.id === 'alarm' ? schliesse() : oeffne('alarm'))}>ALARM</button>

<style>
  /* in der Kopfleiste: liegt nie unter Sheets, Ebenen-Menü oder der Werkzeugleiste */
  .alarm-knopf {
    flex: none;
    min-height: 40px;
    height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    border: 2px solid #ff8a78;
    background: #a3271a;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.5);
  }
</style>
