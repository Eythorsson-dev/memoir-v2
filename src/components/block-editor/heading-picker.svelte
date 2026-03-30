<script lang="ts">
  import { Heading, ChevronDown } from '@lucide/svelte'
  import type { HeaderLevel } from '$lib/block-editor'
  import Dropdown from '../dropdown.svelte'
  import { tooltip } from '../tooltip-attachment.ts'

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
      class="
        relative flex shrink-0 items-center gap-0.5 h-7 px-1.5
        border border-transparent rounded-[5px]
        bg-transparent text-(--toolbar-fg) cursor-pointer
        [&_svg]:pointer-events-none
        [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg)
        aria-pressed:bg-(--toolbar-btn-active-bg) aria-pressed:border-(--toolbar-btn-active-border) aria-pressed:text-(--toolbar-btn-active-color)
      "
      aria-label="Heading"
      aria-pressed={activeLevel !== null}
      aria-haspopup="true"
      aria-expanded={open}
      onmousedown={(e) => { e.preventDefault(); toggle() }}
      {@attach tooltip('Heading')}
    >
      <Heading size={16} />
      <ChevronDown size={14} />
    </button>
  {/snippet}

  {#snippet menu({ close })}
    <div
      class="
        absolute top-[calc(100%+4px)] left-0
        bg-(--panel-bg) text-(--fg) border border-(--border) rounded-md
        p-1 flex flex-col gap-0.5 z-200 min-w-14
        shadow-[0_2px_4px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.18)]
      "
      role="dialog"
      aria-label="Heading level"
    >
      {#each LEVELS as level (level)}
        <button
          class="
            w-full h-7
            text-xs font-semibold rounded-sm px-2
            border border-transparent bg-transparent text-(--toolbar-fg) cursor-pointer
            flex items-center justify-center
            [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg)
            aria-pressed:bg-(--toolbar-btn-active-bg) aria-pressed:border-(--toolbar-btn-active-border) aria-pressed:text-(--toolbar-btn-active-color)
          "
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
