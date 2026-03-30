<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from './button.svelte'
  import type { Shortcut } from './button.svelte'

  let {
    label,
    shortcut,
    disabled = false,
    pressed = false,
    onclick,
    children,
  }: {
    label: string
    shortcut?: Shortcut
    disabled?: boolean
    pressed?: boolean
    onclick?: () => void
    children?: Snippet
  } = $props()
</script>

<Button {label} {shortcut} {disabled} {onclick} aria-pressed={pressed}>
  {@render children?.()}
</Button>
