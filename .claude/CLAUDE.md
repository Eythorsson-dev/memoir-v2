# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Vite dev server (demo at index.html)
pnpm test         # run Vitest in watch mode
pnpm run test     # same as above
pnpm build        # build library to dist/
pnpm typecheck    # run tsc --noEmit
```

Run a single test file:
```bash
pnpm vitest run src/text/serializer.test.ts
```

Run tests once (CI style):
```bash
pnpm vitest run
```

## Development Workflow

**TDD is required.** For every feature or bug fix:
1. Write a failing test first and confirm it fails.
2. Implement the fix/feature.
3. Run `pnpm run test` and confirm all tests pass before finishing.

Use small, atomic commits with [Conventional Commits](https://www.conventionalcommits.org/) messages (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`).

**Commit after each completed and verified step** — do not batch multiple steps into one commit. Always create the commit automatically without asking for confirmation.

**Never commit plan documents** (`plans/` directory). These are local planning notes only.

**Errors must never fail silently.** All unexpected errors must throw. Never swallow exceptions or use empty catch blocks.

## UI Guidelines

**Always use Lucide icons** (`lucide` package, already a dependency) for any icons in the UI. Never use emoji, Unicode symbols, or CSS pseudo-element characters as icon substitutes.

```typescript
import { createElement, ChevronRight, X } from 'lucide'
const icon = createElement(ChevronRight) // returns an SVGElement
```

## Demo Page

The demo page (`index.html` / `src/demo/`) uses **Svelte 5**. The editor library itself (`src/editor/`, `src/blocks/`, `src/text/`) stays pure vanilla TypeScript — no Svelte dependency in the library code.

### Svelte 5 conventions for the demo

- Use runes: `$state` for reactive values, `$derived` for computed values, `$effect` only as a last resort.
- Mount class-based editor components with `{@attach}` — the idiomatic Svelte 5 pattern for handing a DOM node to a vanilla JS library:
  ```svelte
  <script lang="ts">
    import { BlockEditorWithToolbar } from '../editor/BlockEditorWithToolbar'
    function mountEditor(node: HTMLElement) {
      const editor = new BlockEditorWithToolbar(node, initialBlocks)
      return () => editor.destroy()
    }
  </script>
  <div {@attach mountEditor}></div>
  ```
- Use callback props (`let { onchange } = $props()`) instead of `createEventDispatcher`.
- Use snippets (`{#snippet ...}`) instead of named slots.
- Component files: `kebab-case.svelte`; imported as `PascalCase`.
- Use `lang="ts"` (not `lang="typescript"`) on `<script>` tags.

## Component Patterns

All UI components in this library follow a **class-based pattern** — no Web Components, no framework.

**Do not use Web Components (Custom Elements).** The library exposes a programmatic TypeScript API (`new TextEditor(container)`). Web Components add global registration overhead, Shadow DOM complexity, and attribute-only API limitations with no benefit for this use case. ProseMirror and CodeMirror use the same class-based approach.

### Standard component shape

```typescript
class MyComponent {
  private _root: HTMLElement
  private _onFoo = () => { /* arrow fn stored as field for removeEventListener */ }

  constructor(container: HTMLElement, opts: MyOptions) {
    // Build DOM, attach listeners, call _render()
    document.addEventListener('selectionchange', this._onFoo)
  }

  getValue(): State { ... }
  setValue(state: State): void { this._state = state; this._render() }
  onChange(cb: (state: State) => void): () => void { /* return unsubscribe fn */ }

  destroy(): void {
    this._root.remove()
    document.removeEventListener('selectionchange', this._onFoo) // must remove global listeners
  }

  private _render(): void { /* idempotent DOM sync — never recreate; only patch */ }
}
```

**Lifecycle rules:**
- `constructor` — create DOM, register listeners, call `_render()`
- `_render()` — private, idempotent, projects state → DOM; never recreate chrome, only patch (toggle classes/attributes)
- `destroy()` — remove created DOM, **always detach global listeners** (`document`, `window`) stored as private arrow-function fields
- Upward communication via subscription (`onChange(cb): () => void`) — fully type-safe, no `CustomEvent` dispatch

**Re-rendering rules:**
- State flows one way: event → derive new state → `_render()` → notify listeners
- For toolbar/chrome: mutate only what changed (toggle CSS classes, set `aria-pressed`) — never `innerHTML` replace
- For the rich-text area: full serializer re-render is correct (serializer owns the content)
- For future block lists: use key-based reconciliation or `morphdom` rather than full replacement

**CSS injection:** use a single shared `injectSharedStyles()` call with a module-level guard, not per-component injection.

## Architecture

The project is a TypeScript library for a rich-text block editor. Three distinct layers:

### 1. Text Model — `src/text/text.ts`

Immutable value object (`Text`) representing a string with typed inline annotations (`Bold`, `Italic`, `Underline`). All invariants are enforced at construction time:

- Same-type inlines never overlap or touch (merge semantics in `addInline`).
- All ranges are bounded: `0 ≤ start < end ≤ text.length`.
- Inlines are always sorted (start asc, end desc).

Key methods: `addInline`, `removeInline`, `isToggled`. Every mutating method returns a new `Text` instance.

`InlineDtoMap` is a discriminated union — adding a new inline type requires updating it, which propagates exhaustiveness errors to the serializer automatically.

### 2. Serializer — `src/text/serializer.ts`

Bidirectional conversion between `Text` and arrays of DOM nodes.

- **Render:** `buildSegments()` splits text into contiguous segments sharing the same active inline stack, then `renderSegments()` recursively wraps them in the correct tags. Nesting order: longer (outer) inlines wrap shorter (inner) ones.
- **Parse:** `parseNode()` recursively walks DOM nodes, accumulating text and inline annotations. Zero-length inlines (e.g. `<strong><br></strong>` produced by browser Enter behaviour) are skipped.
- Tag mapping: `Bold ↔ <strong>`, `Italic ↔ <em>`, `Underline ↔ <u>`.

### 3. Editor — `src/editor/TextEditor.ts`

`TextEditor` is a self-contained UI component (no framework). It injects CSS, builds a toolbar + `contenteditable` div, and wires everything together.

- `_render()` serializes the current `Text` state to DOM and restores selection.
- `_handleInput()` parses the edited DOM back to `Text` and calls change listeners.
- `_applyOrRemoveInline()` toggles formatting on the current selection using `isToggled`.
- Selection is mapped between DOM positions and character offsets via `getCharOffset` / `findNodeAtOffset`.
- IME composition events are handled separately to avoid premature parses.
