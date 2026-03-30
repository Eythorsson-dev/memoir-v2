<script lang="ts">
  import type { Snippet } from 'svelte'
  import { tooltip } from './popup-attachment.ts'
  import type { Shortcut } from './shortcut.ts'

  export type { Shortcut }

  let {
    label,
    shortcut,
    disabled = false,
    onclick,
    onmousedown,
    children,
    'aria-pressed': ariaPressed,
    'aria-haspopup': ariaHasPopup,
    'aria-expanded': ariaExpanded,
    class: className = 'shrink-0 justify-center w-7 h-7 [&_svg]:w-4 [&_svg]:h-4',
  }: {
    label: string
    shortcut?: Shortcut
    disabled?: boolean
    onclick?: (e: MouseEvent) => void
    onmousedown?: (e: MouseEvent) => void
    children?: Snippet
    'aria-pressed'?: boolean
    'aria-haspopup'?: boolean | 'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
    'aria-expanded'?: boolean
    class?: string
  } = $props()


</script>

<button
  aria-label={label}
  aria-pressed={ariaPressed}
  aria-haspopup={ariaHasPopup}
  aria-expanded={ariaExpanded}
  {disabled}
  class="
    relative flex items-center
    border border-transparent rounded-[5px]
    bg-transparent text-(--toolbar-fg) cursor-pointer
    [&_svg]:pointer-events-none
    [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg)
    disabled:opacity-35 disabled:cursor-default
    aria-pressed:bg-(--toolbar-btn-active-bg) aria-pressed:border-(--toolbar-btn-active-border) aria-pressed:text-(--toolbar-btn-active-color)
    {className}
  "
  {onclick}
  {onmousedown}
  {@attach tooltip(label, shortcut)}
>
  {@render children?.()}
</button>
