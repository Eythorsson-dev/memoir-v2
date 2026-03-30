<script lang="ts">
  import type { Snippet } from 'svelte'
  import { untrack } from 'svelte'
  import { tooltip } from './tooltip-attachment.ts'

  export type Shortcut = {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    key: string
  }

  export function formatShortcut(s: Shortcut): string {
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
    disabled = false,
    onclick,
    children,
    'aria-pressed': ariaPressed,
  }: {
    label: string
    shortcut?: Shortcut
    disabled?: boolean
    onclick?: () => void
    children?: Snippet
    'aria-pressed'?: boolean
  } = $props()

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault()
    onclick?.()
  }

  const shortcutStr = untrack(() => shortcut ? formatShortcut(shortcut) : undefined)
</script>

<button
  aria-label={label}
  aria-pressed={ariaPressed}
  {disabled}
  class="relative flex shrink-0 items-center justify-center w-7 h-7 border border-transparent rounded-[5px] bg-transparent text-(--toolbar-fg) cursor-pointer [&_svg]:w-4 [&_svg]:h-4 [&_svg]:pointer-events-none [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg) disabled:opacity-[0.35] disabled:cursor-default aria-[pressed=true]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:border-(--toolbar-btn-active-border) aria-[pressed=true]:text-(--toolbar-btn-active-color)"
  onmousedown={handleMouseDown}
  {@attach tooltip(label, shortcutStr)}
>
  {@render children?.()}
</button>
