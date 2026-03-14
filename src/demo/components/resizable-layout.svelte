<script lang="ts">
  import { onMount } from 'svelte'

  let {
    storageKey   = 'inspector-width',
    minWidth     = 200,
    maxWidth     = 600,
    defaultWidth = 320,
    editor,
    inspector,
  }: {
    storageKey?:   string
    minWidth?:     number
    maxWidth?:     number
    defaultWidth?: number
    editor:        import('svelte').Snippet
    inspector:     import('svelte').Snippet
  } = $props()

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const stored    = localStorage.getItem(storageKey)
  let width       = $state(stored ? parseInt(stored) : defaultWidth)

  let handleEl: HTMLElement

  function onPointerDown(e: PointerEvent) {
    handleEl.setPointerCapture(e.pointerId)
    e.preventDefault()
    const startX     = e.clientX
    const startWidth = width
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'col-resize'
    handleEl.classList.add('dragging')

    function onMove(e: PointerEvent) {
      width = clamp(startWidth + (startX - e.clientX), minWidth, maxWidth)
    }
    function onUp() {
      handleEl.removeEventListener('pointermove', onMove)
      handleEl.releasePointerCapture(e.pointerId)
      document.body.style.userSelect = ''
      document.body.style.cursor     = ''
      handleEl.classList.remove('dragging')
      localStorage.setItem(storageKey, String(width))
    }
    handleEl.addEventListener('pointermove', onMove)
    handleEl.addEventListener('pointerup', onUp, { once: true })
  }

  function onKeyDown(e: KeyboardEvent) {
    const STEP = 16
    const delta: Record<string, number> = {
      ArrowLeft: STEP, ArrowRight: -STEP,
      Home: -(width - minWidth), End: maxWidth - width,
    }
    if (!(e.key in delta)) return
    e.preventDefault()
    width = clamp(width + delta[e.key]!, minWidth, maxWidth)
    localStorage.setItem(storageKey, String(width))
  }
</script>

<div class="layout">
  <div class="editor-pane">
    {@render editor()}
  </div>

  <div class="sidebar">
    <div
      class="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabindex="0"
      bind:this={handleEl}
      onpointerdown={onPointerDown}
      onkeydown={onKeyDown}
    ></div>

    <div class="inspector-pane" style="width: {width}px">
      {@render inspector()}
    </div>
  </div>
</div>

<style>
  .layout {
    display: flex;
    align-items: stretch;
    min-height: 100dvh;
  }
  .editor-pane {
    flex: 1;
    min-width: 0;
  }
  .sidebar {
    display: flex;
    align-items: stretch;
    position: sticky;
    top: 0;
    height: 100dvh;
    flex-shrink: 0;
  }
  .inspector-pane {
    flex-shrink: 0;
    overflow-y: auto;
  }
  .resize-handle {
    width: 12px;
    padding: 0 4px;
    box-sizing: border-box;
    cursor: col-resize;
    flex-shrink: 0;
    background: transparent;
    border-left: 2px solid var(--border);
    transition: border-color 150ms;
    touch-action: none;
    position: relative;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 0; bottom: 0; left: -4px; right: -4px;
  }
  .resize-handle:hover,
  .resize-handle:focus-visible,
  .resize-handle:global(.dragging) {
    border-color: var(--toolbar-btn-active-border);
    outline: none;
  }
</style>
