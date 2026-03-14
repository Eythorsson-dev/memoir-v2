# 001a — Demo Inspector Sidebar

## Goal

Rebuild the demo page using **Svelte 5**. The editor library itself stays pure vanilla TypeScript. The demo gains a resizable two-pane layout, collapsible inspector sections (with Lucide icons), and `JsonPanel` components for Selection and State JSON.

This phase does **not** change the editor's event API — it continues to use the existing `onChange` / `onSelectionChange`.

---

## Setup

Add Svelte 5 and its Vite plugin to the project:

```bash
pnpm add -D svelte @sveltejs/vite-plugin-svelte
```

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
})
```

Update `index.html` — replace the current `<body>` content with a single mount point and the new entry:

```html
<body>
  <div id="app"></div>
  <script type="module" src="/src/demo/main.ts"></script>
</body>
```

---

## File layout

```
src/
  demo/
    components/
      collapsible-section.svelte   ← collapsible panel with Lucide chevron
      json-panel.svelte            ← wraps collapsible-section with a <pre>
      resizable-layout.svelte      ← two-pane layout with drag handle
    App.svelte                     ← root demo component
    main.ts                        ← mounts App into #app
  editor/  …                       ← library unchanged
```

---

## Layout

```
┌─────────────────────────────┬──┬──────────────────────┐
│  Editor pane (flex: 1)      │▐▌│  Inspector pane       │
│                             │  │  (resizable, sticky)  │
│  [toolbar + contenteditable]│  │  ▼ Selection          │
│                             │  │  ▼ State JSON         │
└─────────────────────────────┴──┴──────────────────────┘
                               ↑ drag handle
```

---

## `main.ts`

```typescript
// src/demo/main.ts
import { mount } from 'svelte'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
```

---

## Component: `collapsible-section.svelte`

Generic collapsible panel using `<details>` / `<summary>`. The Lucide `ChevronRight` icon rotates 90° when open. Open/closed state is persisted to `localStorage` via a `storageKey` prop.

```svelte
<script lang="ts">
  import { createElement, ChevronRight } from 'lucide'
  import { onMount } from 'svelte'

  let {
    title,
    storageKey = '',
    defaultOpen = true,
    children,
  }: {
    title:       string
    storageKey?: string
    defaultOpen?: boolean
    children:    import('svelte').Snippet
  } = $props()

  const stored = storageKey ? localStorage.getItem(storageKey) : null
  let open = $state(stored !== null ? stored === 'true' : defaultOpen)

  function onToggle(e: Event) {
    open = (e.currentTarget as HTMLDetailsElement).open
    if (storageKey) localStorage.setItem(storageKey, String(open))
  }

  let iconContainer: HTMLSpanElement
  onMount(() => {
    iconContainer.appendChild(createElement(ChevronRight))
  })
</script>

<details {open} ontoggle={onToggle}>
  <summary class="section-summary">
    <span class="section-icon" bind:this={iconContainer}></span>
    {title}
  </summary>
  <div class="section-body">
    {@render children()}
  </div>
</details>

<style>
  .section-summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-weight: 600;
    padding: 0.4rem 0;
    list-style: none;
    user-select: none;
  }
  .section-summary :global(.lucide) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: transform 150ms;
    stroke: currentColor;
  }
  details[open] > summary :global(.lucide) {
    transform: rotate(90deg);
  }
  .section-body {
    max-height: 300px;
    overflow-y: auto;
  }
</style>
```

---

## Component: `json-panel.svelte`

Wraps `CollapsibleSection` and renders any value as formatted JSON in a `<pre>`.

```svelte
<script lang="ts">
  import CollapsibleSection from './collapsible-section.svelte'

  let {
    title,
    storageKey,
    value,
  }: {
    title:       string
    storageKey?: string
    value:       unknown
  } = $props()

  const text = $derived(value === null ? 'null' : JSON.stringify(value, null, 2))
</script>

<CollapsibleSection {title} {storageKey}>
  <pre>{text}</pre>
</CollapsibleSection>

<style>
  pre {
    margin: 0;
    background: var(--panel-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 1rem;
    border-radius: 4px;
    white-space: break-spaces;
    overflow: auto;
  }
</style>
```

---

## Component: `resizable-layout.svelte`

Two-pane flex layout with a drag handle. Inspector width is persisted to `localStorage`. Exposes named snippets for each pane.

```svelte
<script lang="ts">
  import { createElement, GripVertical } from 'lucide'
  import { onMount } from 'svelte'

  let {
    storageKey   = 'inspector-width',
    minWidth     = 200,
    maxWidth     = 600,
    defaultWidth = 320,
    editor,      // snippet
    inspector,   // snippet
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
  let gripContainer: HTMLSpanElement

  onMount(() => {
    gripContainer.appendChild(createElement(GripVertical))
  })

  // Drag
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

  // Keyboard
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
  >
    <span class="grip-icon" bind:this={gripContainer}></span>
  </div>

  <div class="inspector-pane" style="width: {width}px">
    {@render inspector()}
  </div>
</div>

<style>
  .layout {
    display: flex;
    gap: 0;
    align-items: flex-start;
  }
  .editor-pane {
    flex: 1;
    min-width: 0;
  }
  .inspector-pane {
    flex-shrink: 0;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    position: sticky;
    top: 1rem;
  }
  .resize-handle {
    width: 4px;
    cursor: col-resize;
    flex-shrink: 0;
    background: transparent;
    border-left: 2px solid var(--border);
    transition: border-color 150ms;
    touch-action: none;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .grip-icon :global(.lucide) {
    width: 12px;
    height: 12px;
    stroke: var(--border);
  }
</style>
```

---

## `App.svelte` — root component

Mounts the editor via `{@attach}` and wires state into the inspector panels.

```svelte
<script lang="ts">
  import { Blocks, Block }            from '../blocks/blocks'
  import { BlockEditorWithToolbar }   from '../editor/BlockEditorWithToolbar'
  import type { BlockSelection }      from '../editor/BlockEditor'
  import ResizableLayout              from './components/resizable-layout.svelte'
  import JsonPanel                    from './components/json-panel.svelte'

  const STORAGE_KEY = 'block-editor-demo-state'

  function loadFromStorage(): Blocks | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? Blocks.from(JSON.parse(raw)) : null
    } catch { return null }
  }

  const initialBlocks = loadFromStorage() ?? Blocks.from([
    new Block('b1', { text: 'Hello world!', inline: [{ type: 'Bold', start: 0, end: 5 }] }, [
      new Block('b2', { text: 'Nested block', inline: [] }, []),
    ]),
  ])

  let selection = $state<BlockSelection | null>(null)
  let blocks    = $state(initialBlocks.blocks)

  // {@attach} is the Svelte 5 idiomatic way to hand a DOM node to a vanilla JS class
  function mountEditor(node: HTMLElement) {
    const editor = new BlockEditorWithToolbar(node, initialBlocks)

    // Temporary wiring — replaced in Phase 2 (001b) with addEventListener
    editor.onChange((b) => {
      blocks = b.blocks
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b.blocks))
    })
    editor.onSelectionChange((sel) => { selection = sel })

    return () => editor.destroy()
  }
</script>

<ResizableLayout>
  {#snippet editor()}
    <div {@attach mountEditor}></div>
  {/snippet}

  {#snippet inspector()}
    <JsonPanel title="Selection" storageKey="inspector-selection" value={selection} />
    <JsonPanel title="State JSON" storageKey="inspector-state"    value={blocks} />
  {/snippet}
</ResizableLayout>
```

---

## Implementation Steps

1. `pnpm add -D svelte @sveltejs/vite-plugin-svelte`
2. Update `vite.config.ts` — add the Svelte plugin
3. Update `tsconfig.json` if needed — add `"compilerOptions": { "moduleResolution": "bundler" }` for Svelte compatibility
4. Create `src/demo/components/collapsible-section.svelte`
5. Create `src/demo/components/json-panel.svelte`
6. Create `src/demo/components/resizable-layout.svelte`
7. Create `src/demo/App.svelte`
8. Create `src/demo/main.ts`
9. Update `index.html` — replace body content with `<div id="app">` and new script tag
10. Delete `src/demo.ts` (replaced by Svelte components)

---

## Out of Scope

- Any changes to the editor event API (that is Phase 2 — 001b).
- SvelteKit — this is a plain Vite + Svelte setup, no routing needed.
- Tests for demo components (display-only, no business logic).
