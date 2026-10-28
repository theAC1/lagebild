<script lang="ts">
  import { schliesse, oeffne, ui } from '../../lib/ui.svelte.ts';
</script>

<button class="alarm-knopf" aria-label="Alarm auslösen" onclick={() => (ui.panel?.id === 'alarm' ? schliesse() : oeffne('alarm'))}>ALARM</button>

<style>
  .alarm-knopf {
    width: 64px;
    height: 64px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid #ff8a78;
    background: #a3271a;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.5);
  }
</style>
