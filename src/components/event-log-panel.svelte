<script lang="ts">
  import CodePreview from './code-preview.svelte'
  import RelativeTimestamp from './relative-timestamp.svelte'
  import { popup } from './popup-attachment'
  import type { BlockEditorEventMap } from '$lib/block-editor'

  export type LogEntry<T extends keyof BlockEditorEventMap = keyof BlockEditorEventMap> = {
    timestamp: number
    name: T
    payload: BlockEditorEventMap[T]
  }

  let {
    entries = $bindable<LogEntry[]>([]),
  }: {
    entries?: LogEntry[]
  } = $props()

  const eventColors: Record<keyof BlockEditorEventMap, string> = {
    blockCreated:     'text-emerald-600 dark:text-emerald-400',
    blockDataUpdated: 'text-blue-600 dark:text-blue-400',
    blockRemoved:     'text-rose-600 dark:text-rose-400',
    blockMoved:       'text-amber-600 dark:text-amber-400',
    selectionChange:  'text-(--fg) opacity-50',
  }

  function colorFor(name: keyof BlockEditorEventMap): string {
    return eventColors[name]
  }
</script>

{#if entries.length === 0}
  <p class="text-xs opacity-40 font-mono py-1 px-1">No events yet…</p>
{:else}
  <div class="overflow-y-auto" style="max-height: 33vh">
    <div class="flex flex-col gap-px font-mono text-[11px] leading-snug">
      {#each entries as entry (entry.timestamp + '_' + entry.name)}
        {#snippet popupBody()}
          <CodePreview language="json" code={JSON.stringify(entry.payload, null, 2)} />
        {/snippet}
        <div
          {@attach popup({
            title: entry.name,
            subtitle: new Date(entry.timestamp).toLocaleTimeString(),
            body: popupBody
          }, 'event-log')}
          class="grid grid-cols-[4.5rem_9rem_1fr] gap-x-2 py-[2px] border-b border-(--border) last:border-none cursor-default"
        >
          <span class="opacity-40 tabular-nums shrink-0"><RelativeTimestamp value={entry.timestamp} /></span>
          <span class={['font-semibold shrink-0', colorFor(entry.name)].join(' ')}>{entry.name}</span>
          <span class="opacity-70 truncate" title={JSON.stringify(entry.payload)}>{JSON.stringify(entry.payload)}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
