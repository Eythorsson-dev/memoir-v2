<script lang="ts">
  import { Highlighter, ChevronDown } from '@lucide/svelte'
  import type { HighlightColor } from '$lib/block-editor'

  const COLORS: HighlightColor[] = ['red', 'amber', 'green', 'blue', 'violet', 'fuchsia']

  let {
    active = false,
    activeColor = null,
    lastUsed = 'amber' as HighlightColor,
    onmainclick,
    onhighlight,
    onremove,
  }: {
    active?: boolean
    activeColor?: HighlightColor | null
    lastUsed?: HighlightColor
    onmainclick?: () => void
    onhighlight?: (color: HighlightColor) => void
    onremove?: () => void
  } = $props()

  let open = $state(false)

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

<div class="wrapper" {@attach setupOutsideClick}>
  <button
    class="main-btn"
    class:is-active={active}
    aria-label="Highlight"
    aria-pressed={active}
    onmousedown={(e) => { e.preventDefault(); onmainclick?.() }}
  >
    <Highlighter size={16} />
    <span class="color-bar" data-color={lastUsed}></span>
    <span class="tooltip">Highlight<kbd>⌘⇧H</kbd></span>
  </button>

  <button
    class="chevron-btn"
    aria-label="Highlight color options"
    aria-haspopup="true"
    aria-expanded={open}
    onmousedown={(e) => { e.preventDefault(); open = !open }}
  >
    <ChevronDown size={10} />
  </button>

  {#if open}
    <div class="picker" role="dialog" aria-label="Highlight color">
      <div class="grid">
        {#each COLORS as color (color)}
          <button
            class="swatch"
            class:is-active={activeColor === color}
            data-color={color}
            aria-label={color}
            title={color}
            onmousedown={(e) => {
              e.preventDefault()
              open = false
              onhighlight?.(color)
            }}
          ></button>
        {/each}
      </div>
      <button
        class="remove-btn"
        onmousedown={(e) => { e.preventDefault(); open = false; onremove?.() }}
      >
        Remove highlight
      </button>
    </div>
  {/if}
</div>

<style>
  .wrapper {
    display: flex;
    align-items: center;
    position: relative;
  }

  .main-btn,
  .chevron-btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--toolbar-fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .main-btn {
    border-radius: 5px 0 0 5px;
    padding: 2px 4px 8px;
    width: 30px;
    height: 28px;
    position: relative;
  }

  .main-btn :global(svg) {
    width: 16px;
    height: 16px;
    pointer-events: none;
  }

  .chevron-btn {
    border-radius: 0 5px 5px 0;
    padding: 0 2px;
    width: 14px;
    align-self: stretch;
    height: auto;
  }

  .chevron-btn :global(svg) {
    width: 10px;
    height: 10px;
    pointer-events: none;
  }

  .main-btn:hover:not(:disabled),
  .chevron-btn:hover:not(:disabled) {
    background: var(--toolbar-btn-hover-bg);
  }

  .main-btn:active:not(:disabled),
  .chevron-btn:active:not(:disabled) {
    background: var(--toolbar-btn-active-bg);
  }

  .main-btn.is-active {
    background: var(--toolbar-btn-active-bg);
    border-color: var(--toolbar-btn-active-border);
    color: var(--toolbar-btn-active-color);
  }

  /* Vivid colour bar under the highlighter icon */
  .color-bar {
    display: block;
    position: absolute;
    bottom: 5px;
    left: 5px;
    right: 21px;
    height: 3px;
    border-radius: 2px;
    pointer-events: none;
    background-color: var(--swatch-bg);
  }

  .tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    background: var(--tooltip-bg);
    color: var(--tooltip-color);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 100;
  }

  .main-btn:hover .tooltip {
    display: block;
  }

  kbd {
    opacity: 0.65;
    font-family: inherit;
    margin-left: 4px;
  }

  /* ─── Picker popover ──────────────────────────────────────────────────────── */

  .picker {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 200;
    background: var(--panel-bg, #f4f4f4);
    color: var(--fg, #111);
    border: 1px solid var(--border, #ccc);
    border-radius: 10px;
    padding: 10px;
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 8px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 192px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
  }

  /* ─── Swatches ──────────────────────────────────────────────────────────── */

  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1.5px solid rgba(0, 0, 0, 0.14);
    cursor: pointer;
    padding: 0;
    background-color: var(--swatch-bg);
    position: relative;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
    flex-shrink: 0;
  }

  .swatch:hover:not(:disabled) {
    background-color: var(--swatch-bg);
    transform: scale(1.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
    z-index: 1;
  }

  .swatch.is-active {
    background-color: var(--swatch-bg);
    border-color: var(--fg, #111);
    box-shadow: 0 0 0 2px var(--panel-bg, #f4f4f4), 0 0 0 4px var(--fg, #111);
  }

  .swatch.is-active::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6l3 3 5-5' stroke='%23000000' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-position: center;
    background-repeat: no-repeat;
    background-size: 10px;
    opacity: 0.55;
  }

  /* ─── Remove button ───────────────────────────────────────────────────────── */

  .remove-btn {
    width: 100%;
    height: auto;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--border, #ccc);
    background: transparent;
    color: var(--fg, #111);
    font-size: 11.5px;
    cursor: pointer;
    text-align: center;
    transition: background 0.1s, border-color 0.1s;
  }

  .remove-btn:hover:not(:disabled) {
    background: var(--toolbar-btn-hover-bg, #f0f0f0);
  }

  /* ─── Swatch colours ─────────────────────────────────────────────────────── */

  .swatch[data-color="red"],
  .color-bar[data-color="red"]     { --swatch-bg: #fca5a5 }
  .swatch[data-color="amber"],
  .color-bar[data-color="amber"]   { --swatch-bg: #fcd34d }
  .swatch[data-color="green"],
  .color-bar[data-color="green"]   { --swatch-bg: #86efac }
  .swatch[data-color="blue"],
  .color-bar[data-color="blue"]    { --swatch-bg: #93c5fd }
  .swatch[data-color="violet"],
  .color-bar[data-color="violet"]  { --swatch-bg: #c4b5fd }
  .swatch[data-color="fuchsia"],
  .color-bar[data-color="fuchsia"] { --swatch-bg: #f0abfc }

  :global([data-theme="dark"]) .swatch[data-color="red"],
  :global([data-theme="dark"]) .color-bar[data-color="red"]     { --swatch-bg: rgb(248 113 113 / 0.8) }
  :global([data-theme="dark"]) .swatch[data-color="amber"],
  :global([data-theme="dark"]) .color-bar[data-color="amber"]   { --swatch-bg: rgb(251 191 36 / 0.8) }
  :global([data-theme="dark"]) .swatch[data-color="green"],
  :global([data-theme="dark"]) .color-bar[data-color="green"]   { --swatch-bg: rgb(74 222 128 / 0.8) }
  :global([data-theme="dark"]) .swatch[data-color="blue"],
  :global([data-theme="dark"]) .color-bar[data-color="blue"]    { --swatch-bg: rgb(96 165 250 / 0.8) }
  :global([data-theme="dark"]) .swatch[data-color="violet"],
  :global([data-theme="dark"]) .color-bar[data-color="violet"]  { --swatch-bg: rgb(167 139 250 / 0.8) }
  :global([data-theme="dark"]) .swatch[data-color="fuchsia"],
  :global([data-theme="dark"]) .color-bar[data-color="fuchsia"] { --swatch-bg: rgb(232 121 249 / 0.8) }
</style>
