<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from './button.svelte'
  import type { Shortcut } from './shortcut.ts'

  let {
    label,
    shortcut,
    disabled = false,
    showTooltip = true,
    pressed = false,
    onclick,
    onmousedown,
    children,
    'aria-haspopup': ariaHasPopup,
    'aria-expanded': ariaExpanded,
    class: className,
  }: {
    label: string
    shortcut?: Shortcut
    disabled?: boolean
    showTooltip?: boolean
    pressed?: boolean
    onclick?: (e: MouseEvent) => void
    onmousedown?: (e: MouseEvent) => void
    children?: Snippet
    'aria-haspopup'?: boolean | 'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
    'aria-expanded'?: boolean
    class?: string
  } = $props()
</script>

<Button {label} {shortcut} {disabled} {showTooltip} {onclick} {onmousedown} aria-pressed={pressed} aria-haspopup={ariaHasPopup} aria-expanded={ariaExpanded} class={className}>
  {@render children?.()}
</Button>
