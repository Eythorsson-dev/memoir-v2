<script lang="ts">
  import { formatShortcut, type Shortcut } from './shortcut.ts'

  let { label, shortcut, x, anchorTop }: {
    label: string
    shortcut?: Shortcut
    x: number
    anchorTop: number
  } = $props()
</script>

<span
  style="left:{x}px; bottom:{window.innerHeight - anchorTop + 6}px"
  class="
    fixed -translate-x-1/2 whitespace-nowrap
    bg-(--tooltip-bg) text-(--tooltip-color) text-[11px]
    px-2 py-[3px] rounded
    pointer-events-none z-[100]
  "
>
  {label}{#if shortcut}<kbd class="opacity-[0.65] font-[inherit] ml-1">{formatShortcut(shortcut)}</kbd>{/if}
</span>
