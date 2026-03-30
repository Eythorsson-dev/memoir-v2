<script lang="ts">
  import type { Snippet } from 'svelte'
  import { clickOutside } from './popup-attachment.ts'

  let {
    trigger,
    menu,
  }: {
    /** Snippet receives `open: boolean` and `toggle: () => void`. */
    trigger: Snippet<[{ open: boolean; toggle: () => void }]>
    /** Snippet rendered inside the popover when open. */
    menu: Snippet<[{ close: () => void }]>
  } = $props()

  let open = $state(false)

  function toggle() {
    open = !open
  }

  function close() {
    open = false
  }

  const setupOutsideClick = clickOutside(close)
</script>

<div class="relative" {@attach setupOutsideClick}>
  {@render trigger({ open, toggle })}
  {#if open}
    {@render menu({ close })}
  {/if}
</div>
