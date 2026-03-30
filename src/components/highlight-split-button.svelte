<script lang="ts">
  import { Highlighter, ChevronDown } from '@lucide/svelte'
  import type { HighlightColor } from '$lib/block-editor'
  import Dropdown from './dropdown.svelte'

  const COLORS: HighlightColor[] = ['red', 'amber', 'green', 'blue', 'violet', 'fuchsia']

  let {
    active = false,
    activeColor = null,
    lastUsed = 'amber' as HighlightColor,
    onmainclick,
    onhighlight,
    onremove,
  }: {
    active?: boolean
    activeColor?: HighlightColor | null
    lastUsed?: HighlightColor
    onmainclick?: () => void
    onhighlight?: (color: HighlightColor) => void
    onremove?: () => void
  } = $props()
</script>

<div class="flex items-center">
  <button
    class="group relative flex items-center justify-center border border-transparent bg-transparent text-(--toolbar-fg) cursor-pointer [&_svg]:pointer-events-none rounded-l-[5px] px-1 pt-[2px] pb-2 w-[30px] h-7 [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:border-(--toolbar-btn-active-border) aria-[pressed=true]:text-(--toolbar-btn-active-color)"
    aria-label="Highlight"
    aria-pressed={active}
    onmousedown={(e) => { e.preventDefault(); onmainclick?.() }}
  >
    <Highlighter size={16} />
    <span class="block absolute bottom-[5px] left-[5px] right-[21px] h-[3px] rounded-[2px] pointer-events-none bg-(--swatch-bg)" data-color={lastUsed}></span>
    <span class="hidden group-[&:hover:not(:disabled)]:block absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap bg-(--tooltip-bg) text-(--tooltip-color) text-[11px] px-2 py-[3px] rounded pointer-events-none z-[100]">
      Highlight<kbd class="opacity-[0.65] font-[inherit] ml-1">⌘⇧H</kbd>
    </span>
  </button>

  <Dropdown>
    {#snippet trigger({ open, toggle })}
      <button
        class="flex items-center justify-center self-stretch border border-transparent bg-transparent text-(--toolbar-fg) cursor-pointer [&_svg]:pointer-events-none rounded-r-[5px] px-[2px] w-[14px] h-auto [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg)"
        aria-label="Highlight color options"
        aria-haspopup="true"
        aria-expanded={open}
        onmousedown={(e) => { e.preventDefault(); toggle() }}
      >
        <ChevronDown size={10} />
      </button>
    {/snippet}

    {#snippet menu({ close })}
      <div
        class="absolute top-[calc(100%+8px)] left-0 z-[200] bg-(--panel-bg) text-(--fg) border border-(--border) rounded-[10px] p-[10px] flex flex-col gap-2 min-w-48 shadow-[0_2px_4px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-label="Highlight color"
      >
        <div class="grid grid-cols-6 gap-[5px]">
          {#each COLORS as color (color)}
            <button
              class="w-[26px] h-[26px] rounded-[6px] border-[1.5px] border-black/[0.14] cursor-pointer p-0 bg-(--swatch-bg) relative transition-[transform,box-shadow] duration-100 ease-in-out shrink-0 [&:hover:not(:disabled)]:scale-[1.2] [&:hover:not(:disabled)]:shadow-[0_2px_8px_rgba(0,0,0,0.22)] [&:hover:not(:disabled)]:z-[1] aria-[pressed=true]:border-(--fg) aria-[pressed=true]:shadow-[0_0_0_2px_var(--panel-bg),0_0_0_4px_var(--fg)]"
              aria-label={color}
              aria-pressed={activeColor === color}
              data-color={color}
              title={color}
              onmousedown={(e) => {
                e.preventDefault()
                close()
                onhighlight?.(color)
              }}
            ></button>
          {/each}
        </div>
        <button
          class="w-full px-2 py-[5px] rounded-[6px] border border-(--border) bg-transparent text-(--fg) text-[11.5px] cursor-pointer text-center transition-[background,border-color] duration-100 [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg)"
          onmousedown={(e) => { e.preventDefault(); close(); onremove?.() }}
        >
          Remove highlight
        </button>
      </div>
    {/snippet}
  </Dropdown>
</div>

<style>
  /* Swatch colour variables */
  [data-color="red"]     { --swatch-bg: #fca5a5 }
  [data-color="amber"]   { --swatch-bg: #fcd34d }
  [data-color="green"]   { --swatch-bg: #86efac }
  [data-color="blue"]    { --swatch-bg: #93c5fd }
  [data-color="violet"]  { --swatch-bg: #c4b5fd }
  [data-color="fuchsia"] { --swatch-bg: #f0abfc }

  :global([data-theme="dark"]) [data-color="red"]     { --swatch-bg: rgb(248 113 113 / 0.8) }
  :global([data-theme="dark"]) [data-color="amber"]   { --swatch-bg: rgb(251 191 36 / 0.8) }
  :global([data-theme="dark"]) [data-color="green"]   { --swatch-bg: rgb(74 222 128 / 0.8) }
  :global([data-theme="dark"]) [data-color="blue"]    { --swatch-bg: rgb(96 165 250 / 0.8) }
  :global([data-theme="dark"]) [data-color="violet"]  { --swatch-bg: rgb(167 139 250 / 0.8) }
  :global([data-theme="dark"]) [data-color="fuchsia"] { --swatch-bg: rgb(232 121 249 / 0.8) }

  /* Active swatch checkmark */
  button[aria-pressed="true"]::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6l3 3 5-5' stroke='%23000000' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-position: center;
    background-repeat: no-repeat;
    background-size: 10px;
    opacity: 0.55;
  }
</style>
