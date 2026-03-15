<script lang="ts">
  import CollapsibleSection from './collapsible-section.svelte'

  export type LogEntry = {
    time: string
    name: string
    payload: string
  }

  let {
    title,
    storageKey = '',
    entries = $bindable<LogEntry[]>([]),
  }: {
    title: string
    storageKey?: string
    entries?: LogEntry[]
  } = $props()

  const eventColors: Record<string, string> = {
    blockCreated:     'text-emerald-600 dark:text-emerald-400',
    blockDataUpdated: 'text-blue-600 dark:text-blue-400',
    blockRemoved:     'text-rose-600 dark:text-rose-400',
    blockMoved:       'text-amber-600 dark:text-amber-400',
    selectionChange:  'text-(--fg) opacity-50',
  }

  function colorFor(name: string): string {
    return eventColors[name] ?? 'text-(--fg)'
  }
</script>

<CollapsibleSection {title} {storageKey} defaultOpen={true}>
  {#if entries.length === 0}
    <p class="text-xs opacity-40 font-mono py-1 px-1">No events yet…</p>
  {:else}
    <div class="flex flex-col gap-px font-mono text-[11px] leading-snug">
      {#each entries as entry (entry.time + entry.name + entry.payload)}
        <div class="grid grid-cols-[4.5rem_9rem_1fr] gap-x-2 py-[2px] border-b border-(--border) last:border-none">
          <span class="opacity-40 tabular-nums shrink-0">{entry.time}</span>
          <span class={['font-semibold shrink-0', colorFor(entry.name)].join(' ')}>{entry.name}</span>
          <span class="opacity-70 truncate" title={entry.payload}>{entry.payload}</span>
        </div>
      {/each}
    </div>
  {/if}
</CollapsibleSection>
