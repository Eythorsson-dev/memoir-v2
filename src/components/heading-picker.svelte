<script lang="ts">
  import { Heading, ChevronDown } from '@lucide/svelte'
  import type { HeaderLevel } from '$lib/block-editor'
  import Dropdown from './dropdown.svelte'

  const LEVELS = [1, 2, 3] as const satisfies ReadonlyArray<HeaderLevel>

  let {
    activeLevel = null,
    onselect,
  }: {
    activeLevel?: HeaderLevel | null
    onselect?: (level: HeaderLevel) => void
  } = $props()
</script>

<Dropdown>
  {#snippet trigger({ open, toggle })}
    <button
      class="group relative flex shrink-0 items-center gap-[2px] h-7 px-[6px] border border-transparent rounded-[5px] bg-transparent text-(--toolbar-fg) cursor-pointer [&_svg]:pointer-events-none [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:border-(--toolbar-btn-active-border) aria-[pressed=true]:text-(--toolbar-btn-active-color)"
      aria-label="Heading"
      aria-pressed={activeLevel !== null}
      aria-haspopup="true"
      aria-expanded={open}
      onmousedown={(e) => { e.preventDefault(); toggle() }}
    >
      <Heading size={16} />
      <ChevronDown size={14} />
      <span class="hidden group-[&:hover:not(:disabled)]:block absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap bg-(--tooltip-bg) text-(--tooltip-color) text-[11px] px-2 py-[3px] rounded pointer-events-none z-[100]">
        Heading
      </span>
    </button>
  {/snippet}

  {#snippet menu({ close })}
    <div class="absolute top-[calc(100%+4px)] left-0 bg-(--panel-bg) text-(--fg) border border-(--border) rounded-[6px] p-1 flex flex-col gap-[2px] z-[200] min-w-14 shadow-[0_2px_4px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.18)]" role="dialog" aria-label="Heading level">
      {#each LEVELS as level (level)}
        <button
          class="w-full h-7 text-xs font-semibold rounded-[4px] px-2 border border-transparent bg-transparent text-(--toolbar-fg) cursor-pointer flex items-center justify-center [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) aria-[pressed=true]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:border-(--toolbar-btn-active-border) aria-[pressed=true]:text-(--toolbar-btn-active-color)"
          aria-label="Heading {level}"
          aria-pressed={activeLevel === level}
          onmousedown={(e) => {
            e.preventDefault()
            close()
            onselect?.(level)
          }}
        >
          H{level}
        </button>
      {/each}
    </div>
  {/snippet}
</Dropdown>
