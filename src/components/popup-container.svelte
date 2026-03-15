<script lang="ts">
  import type { Snippet } from 'svelte'
  import { computePosition } from './popup-attachment.ts'

  type Body = string | Snippet

  let { title, subtitle, body, x, anchorTop, anchorBottom }: {
    title:        string
    subtitle?:    string
    body:         Body
    x:            number
    anchorTop:    number
    anchorBottom: number
  } = $props()

  let popupW = $state(0)
  let popupH = $state(0)
  let measured = $state(false)

  let timeout: ReturnType<typeof setTimeout>;
  function observe(el: HTMLElement) {
    const ro = new ResizeObserver(() => {
      popupW = el.offsetWidth
      popupH = el.offsetHeight

      clearTimeout(timeout);
      timeout = setTimeout(() => measured = true, 100);
    })
    ro.observe(el)
    return () => ro.disconnect()
  }

  let pos = $derived(computePosition(x, anchorTop, anchorBottom, popupW, popupH, window.innerWidth, window.innerHeight))
</script>

<div
  {@attach observe}
  style="position:fixed; top:{pos.top}px; left:{pos.left}px; max-height:60vh; z-index:50; opacity:{measured ? 1 : 0}; transition: opacity 0.08s;"
  class="max-w-xl bg-(--panel-bg) border border-(--border) rounded shadow-lg overflow-auto flex flex-col"
>
  <div class="flex items-baseline justify-between px-3 py-2 border-b border-(--border) shrink-0">
    <span class="font-mono font-semibold text-xs">{title}</span>
    {#if subtitle}
      <span class="font-mono text-[10px] opacity-40 tabular-nums">{subtitle}</span>
    {/if}
  </div>
  <div class="p-3">
    {#if typeof body === 'string'}
      <p class="font-mono text-xs text-(--fg)">{body}</p>
    {:else}
      {@render body()}
    {/if}
  </div>
</div>
