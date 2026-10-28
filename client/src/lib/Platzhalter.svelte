<script lang="ts">
  let { params = {} }: { params?: Record<string, any> } = $props();
</script>

<p class="platzhalter">Diese Funktion folgt.</p>
{#if Object.keys(params).length}<pre class="platzhalter">{JSON.stringify(params)}</pre>{/if}

<style>
  .platzhalter {
    color: var(--text-2);
    margin: 0;
    padding: 8px 0;
  }
</style>
