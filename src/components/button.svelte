<script lang="ts">
  import type { Snippet } from 'svelte'

  export type Shortcut = {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    key: string
  }

  function formatShortcut(s: Shortcut): string {
    let result = ''
    if (s.ctrl) result += '⌘'
    if (s.alt) result += '⌥'
    if (s.shift) result += '⇧'
    result += s.key
    return result
  }

  let {
    label,
    shortcut,
    pressed = false,
    disabled = false,
    onclick,
    children,
  }: {
    label: string
    shortcut?: Shortcut
    pressed?: boolean
    disabled?: boolean
    onclick?: () => void
    children?: Snippet
  } = $props()

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault()
    onclick?.()
  }
</script>

<button
  aria-label={label}
  aria-pressed={pressed}
  {disabled}
  class="group relative flex shrink-0 items-center justify-center w-7 h-7 border border-transparent rounded-[5px] bg-transparent text-(--toolbar-fg) cursor-pointer [&_svg]:w-4 [&_svg]:h-4 [&_svg]:pointer-events-none [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg) disabled:opacity-[0.35] disabled:cursor-default aria-[pressed=true]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:border-(--toolbar-btn-active-border) aria-[pressed=true]:text-(--toolbar-btn-active-color)"
  onmousedown={handleMouseDown}
>
  {@render children?.()}
  <span class="hidden group-[&:hover:not(:disabled)]:block absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap bg-(--tooltip-bg) text-(--tooltip-color) text-[11px] px-2 py-[3px] rounded pointer-events-none z-[100]">
    {label}{#if shortcut}<kbd class="opacity-[0.65] font-[inherit] ml-1">{formatShortcut(shortcut)}</kbd>{/if}
  </span>
</button>
