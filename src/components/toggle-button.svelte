<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from './button.svelte'
  import type { Shortcut } from './shortcut.ts'

  let {
    label,
    shortcut,
    disabled = false,
    pressed = false,
    onclick,
    onmousedown,
    children,
  }: {
    label: string
    shortcut?: Shortcut
    disabled?: boolean
    pressed?: boolean
    onclick?: (e: MouseEvent) => void
    onmousedown?: (e: MouseEvent) => void
    children?: Snippet
  } = $props()
</script>

<Button {label} {shortcut} {disabled} {onclick} {onmousedown} aria-pressed={pressed}>
  {@render children?.()}
</Button>
