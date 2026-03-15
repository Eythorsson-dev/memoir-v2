<script lang="ts">
  import CollapsibleSection from './collapsible-section.svelte'

  let {
    title,
    storageKey,
    value,
  }: {
    title:       string
    storageKey?: string
    value:       unknown
  } = $props()

  const text = $derived(value === null ? 'null' : JSON.stringify(value, null, 2))
</script>

<CollapsibleSection {title} {storageKey}>
  <pre>{text}</pre>
</CollapsibleSection>

<style>
  pre {
    margin: 0;
    background: var(--panel-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 1rem;
    border-radius: 4px;
    white-space: break-spaces;
    overflow: auto;
  }
</style>
