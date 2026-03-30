<script lang="ts">
  import { Heading, ChevronDown } from '@lucide/svelte'
  import type { HeaderLevel } from '$lib/block-editor'

  const LEVELS = [1, 2, 3] as const satisfies ReadonlyArray<HeaderLevel>

  let {
    activeLevel = null,
    onselect,
  }: {
    activeLevel?: HeaderLevel | null
    onselect?: (level: HeaderLevel) => void
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
    class:is-active={activeLevel !== null}
    aria-label="Heading"
    aria-pressed={activeLevel !== null}
    aria-haspopup="true"
    aria-expanded={open}
    onmousedown={(e) => { e.preventDefault(); open = !open }}
  >
    <Heading size={16} />
    <ChevronDown size={14} />
    <span class="tooltip">Heading</span>
  </button>

  {#if open}
    <div class="picker" role="dialog" aria-label="Heading level">
      {#each LEVELS as level (level)}
        <button
          class="option"
          class:is-active={activeLevel === level}
          aria-label="Heading {level}"
          aria-pressed={activeLevel === level}
          onmousedown={(e) => {
            e.preventDefault()
            open = false
            onselect?.(level)
          }}
        >
          H{level}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .main-btn {
    width: auto;
    padding: 0 6px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--toolbar-fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 2px;
    position: relative;
    flex-shrink: 0;
  }

  .main-btn :global(svg) {
    width: 16px;
    height: 16px;
    pointer-events: none;
  }

  .main-btn:hover:not(:disabled) {
    background: var(--toolbar-btn-hover-bg);
  }

  .main-btn:active:not(:disabled) {
    background: var(--toolbar-btn-active-bg);
  }

  .main-btn.is-active {
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

  .main-btn:hover .tooltip {
    display: block;
  }

  .picker {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--panel-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 200;
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 8px 24px rgba(0, 0, 0, 0.18);
    min-width: 56px;
  }

  .option {
    width: 100%;
    height: 28px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 4px;
    padding: 0 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--toolbar-fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .option:hover:not(:disabled) {
    background: var(--toolbar-btn-hover-bg);
  }

  .option.is-active {
    background: var(--toolbar-btn-active-bg);
    border-color: var(--toolbar-btn-active-border);
    color: var(--toolbar-btn-active-color);
  }
</style>
