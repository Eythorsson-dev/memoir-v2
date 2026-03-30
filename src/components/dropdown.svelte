<script lang="ts">
  import type { Snippet } from 'svelte'

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

  function setupOutsideClick(node: HTMLElement) {
    const handler = (e: MouseEvent) => {
      if (open && !node.contains(e.target as Node)) {
        open = false
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }
</script>

<div class="relative" {@attach setupOutsideClick}>
  {@render trigger({ open, toggle })}
  {#if open}
    {@render menu({ close })}
  {/if}
</div>
