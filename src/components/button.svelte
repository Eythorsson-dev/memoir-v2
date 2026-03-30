<script lang="ts">
  import type { Snippet } from 'svelte'
  import { tooltip } from './tooltip-attachment.ts'
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
  }: {
    label: string
    shortcut?: Shortcut
    disabled?: boolean
    onclick?: (e: MouseEvent) => void
    onmousedown?: (e: MouseEvent) => void
    children?: Snippet
    'aria-pressed'?: boolean
  } = $props()


</script>

<button
  aria-label={label}
  aria-pressed={ariaPressed}
  {disabled}
  class="relative flex shrink-0 items-center justify-center w-7 h-7 border border-transparent rounded-[5px] bg-transparent text-(--toolbar-fg) cursor-pointer [&_svg]:w-4 [&_svg]:h-4 [&_svg]:pointer-events-none [&:hover:not(:disabled)]:bg-(--toolbar-btn-hover-bg) [&:active:not(:disabled)]:bg-(--toolbar-btn-active-bg) disabled:opacity-[0.35] disabled:cursor-default aria-[pressed=true]:bg-(--toolbar-btn-active-bg) aria-[pressed=true]:border-(--toolbar-btn-active-border) aria-[pressed=true]:text-(--toolbar-btn-active-color)"
  {onclick}
  {onmousedown}
  {@attach tooltip(label, shortcut)}
>
  {@render children?.()}
</button>
