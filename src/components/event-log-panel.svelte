<script lang="ts">
  import CodePreview from './code-preview.svelte'
  import { popup } from './popup-attachment'

  export type LogEntry = {
    time: string
    name: string
    payload: string
  }

  let {
    entries = $bindable<LogEntry[]>([]),
  }: {
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

{#if entries.length === 0}
  <p class="text-xs opacity-40 font-mono py-1 px-1">No events yet…</p>
{:else}
  <div class="overflow-y-auto" style="max-height: 33vh">
    <div class="flex flex-col gap-px font-mono text-[11px] leading-snug">
      {#each entries as entry (entry.time + entry.name + entry.payload)}
        <div
          {@attach popup({
            title: entry.name,
            subtitle: entry.time,
            body: {
              component: CodePreview,
              props: {
                language: 'json',
                code: JSON.stringify(JSON.parse(entry.payload), null, 2)
              }
            }
          }, 'event-log')}
          class="grid grid-cols-[4.5rem_9rem_1fr] gap-x-2 py-[2px] border-b border-(--border) last:border-none cursor-default"
        >
          <span class="opacity-40 tabular-nums shrink-0">{entry.time}</span>
          <span class={['font-semibold shrink-0', colorFor(entry.name)].join(' ')}>{entry.name}</span>
          <span class="opacity-70 truncate" title={entry.payload}>{entry.payload}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
