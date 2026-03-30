<script lang="ts">
  import type { Snippet } from 'svelte'

  export type Shortcut = {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    key: string
  }

  function formatShortcut(s: Shortcut): string {
    let result = ''
    if (s.ctrl) result += '⌘'
    if (s.alt) result += '⌥'
    if (s.shift) result += '⇧'
    result += s.key
    return result
  }

  let {
    label,
    shortcut,
    pressed = false,
    disabled = false,
    onclick,
    children,
  }: {
    label: string
    shortcut?: Shortcut
    pressed?: boolean
    disabled?: boolean
    onclick?: () => void
    children?: Snippet
  } = $props()
</script>

<button
  aria-label={label}
  aria-pressed={pressed}
  {disabled}
  class:is-active={pressed}
  onmousedown={(e) => { e.preventDefault(); onclick?.() }}
>
  {@render children?.()}
  <span class="tooltip">
    {label}{#if shortcut}<kbd>{formatShortcut(shortcut)}</kbd>{/if}
  </span>
</button>

<style>
  button {
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--toolbar-fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;
  }

  button :global(svg) {
    width: 16px;
    height: 16px;
    pointer-events: none;
  }

  button:hover:not(:disabled) {
    background: var(--toolbar-btn-hover-bg);
  }

  button:active:not(:disabled) {
    background: var(--toolbar-btn-active-bg);
  }

  button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  button.is-active {
    background: var(--toolbar-btn-active-bg);
    border-color: var(--toolbar-btn-active-border);
    color: var(--toolbar-btn-active-color);
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

  button:hover .tooltip {
    display: block;
  }

  kbd {
    opacity: 0.65;
    font-family: inherit;
    margin-left: 4px;
  }
</style>
