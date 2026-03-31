<script lang="ts">
  import type { Snippet } from 'svelte'
  import { clickOutside, popupOnClick } from './popup-attachment.ts'

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
  let wrapperEl = $state<HTMLElement | null>(null)

  function toggle() {
    open = !open
  }

  function close() {
    open = false
  }

  const setupOutsideClick = clickOutside(close)
</script>

<div bind:this={wrapperEl} {@attach setupOutsideClick}>
  {@render trigger({ open, toggle })}
  {#if open && wrapperEl}
    <div style="position: fixed; z-index: 200;" {@attach popupOnClick(wrapperEl)}>
      {@render menu({ close })}
    </div>
  {/if}
</div>
