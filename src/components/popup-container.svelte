<script lang="ts">
  import type { Snippet, Component } from 'svelte'
  import { computePosition } from './popup-attachment.ts'

  type Body =
    | string
    | Snippet
    | { component: Component<any>; props?: Record<string, unknown> }

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

  function measure(el: HTMLElement) {
    popupW = el.offsetWidth
    popupH = el.offsetHeight
  }

  let pos = $derived(computePosition(x, anchorTop, anchorBottom, popupW, popupH, window.innerWidth, window.innerHeight))
</script>

<div
  {@attach measure}
  style="position:fixed; top:{pos.top}px; left:{pos.left}px; max-height:60vh; z-index:50;"
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
    {:else if typeof body === 'function'}
      {@render body()}
    {:else}
      <body.component {...(body.props ?? {})} />
    {/if}
  </div>
</div>
