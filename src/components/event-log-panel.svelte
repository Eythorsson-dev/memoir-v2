<script lang="ts">
  import CodePreview from './code-preview.svelte'
  import RelativeTimestamp from './relative-timestamp.svelte'
  import { popup } from './popup-attachment'
  import type { BlockEditorEventDtoMap } from '$lib/block-editor'
  import { Trash2Icon } from '@lucide/svelte'

  export type LogEntry<T extends keyof BlockEditorEventDtoMap = keyof BlockEditorEventDtoMap> = {
    timestamp: number
    name: T
    payload: BlockEditorEventDtoMap[T]
  }

  let {
    entries = $bindable<LogEntry[]>([]),
  }: {
    entries?: LogEntry[]
  } = $props()

  const eventColors: Record<keyof BlockEditorEventDtoMap, string> = {
    blockCreated:     'text-emerald-600 dark:text-emerald-400',
    blockDataUpdated: 'text-blue-600 dark:text-blue-400',
    blockRemoved:     'text-rose-600 dark:text-rose-400',
    blockMoved:       'text-amber-600 dark:text-amber-400',
    selectionChange:  'text-(--fg) opacity-50',
  }

  function colorFor(name: keyof BlockEditorEventDtoMap): string {
    return eventColors[name]
  }
</script>

<div class="flex justify-end px-1 pb-1">
  <button
    onclick={() => (entries = [])}
    disabled={entries.length === 0}
    class="flex items-center gap-1 text-[11px] opacity-50 hover:opacity-100 disabled:opacity-20 disabled:pointer-events-none transition-opacity cursor-default"
    title="Clear event log"
  >
    <Trash2Icon size={11} />
    Clear
  </button>
</div>

{#if entries.length === 0}
  <p class="text-xs opacity-40 font-mono py-1 px-1">No events yet…</p>
{:else}
  <div class="overflow-y-auto" style="max-height: 33vh">
    <div class="flex flex-col gap-px font-mono text-[11px] leading-snug">
      {#each entries as entry}
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
