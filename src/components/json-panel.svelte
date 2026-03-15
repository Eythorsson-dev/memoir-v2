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
  <pre class="m-0 bg-(--panel-bg) text-(--fg) text-sm border border-(--border) p-4 rounded whitespace-break-spaces overflow-auto">{text}</pre>
</CollapsibleSection>
