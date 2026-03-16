# Block Editor Library

## File Structure

- `src/lib/block-editor/text/` — Text model and serializer
- `src/lib/block-editor/blocks/` — Block model and serializer
- `src/lib/block-editor/editor/` — UI components (TextEditor, BlockEditor, BlockEditorWithToolbar)
- `src/lib/block-editor/index.ts` — public API; all new exports must be added here
- Tests live alongside source files as `*.test.ts`

## Boundary Rule

The library is **pure vanilla TypeScript** — no Svelte, no framework, no `$lib` imports. It must be usable outside of SvelteKit. Never import from `src/routes/` or `src/components/`.

## Icons

Use the **`lucide`** vanilla JS package. Never use a framework-specific Lucide package in the library.

```typescript
import { createElement, ChevronRight, X } from 'lucide'
const icon = createElement(ChevronRight) // returns an SVGElement
```

## CSS

Each editor component has a co-located `.css` file (e.g. `text-editor.css`, `block-editor.css`). Import it directly at the top of the TypeScript file:

```typescript
import './text-editor.css'
```

Do not inject styles via JavaScript or use inline `style` attributes for anything beyond dynamic values.

## Testing

- Tests live alongside source: `text.ts` → `text.test.ts`, `serializer.ts` → `serializer.test.ts`
- Test the model and serializer logic — inputs, outputs, edge cases
- Do not test DOM rendering directly; test the data transformations that drive it
- Run a single file: `pnpm vitest run src/lib/block-editor/text/text.test.ts`

## Private Fields

Use **JavaScript native `#` private fields** for all private class members. Do not use TypeScript's `private` keyword or the `_` prefix convention.

- `#` fields are enforced at **runtime** — they cannot be bypassed via bracket notation, `Object.keys`, JSON serialization, or Proxy.
- TypeScript's `private` keyword is compile-time only; the field is a plain public property at runtime.
- The `_` prefix is a legacy convention with no enforcement — actively discouraged by the Google TypeScript Style Guide and the TypeScript team.
- For members that subclasses must access, use TypeScript's `protected` keyword (no `#` equivalent exists).
- When accessing a private **static** `#` field, always reference it via the class name — never via `this` — to avoid a `TypeError` when the method is inherited.

## Component Patterns

All UI components follow a **class-based pattern** — no Web Components, no framework.

**Do not use Web Components (Custom Elements).** They add global registration overhead, Shadow DOM complexity, and attribute-only API limitations. ProseMirror and CodeMirror use the same class-based approach.

### Standard component shape

```typescript
class MyComponent {
  #root: HTMLElement
  #onFoo = () => { /* arrow fn stored as field for removeEventListener */ }

  constructor(container: HTMLElement, opts: MyOptions) {
    // Build DOM, attach listeners, call #render()
    document.addEventListener('selectionchange', this.#onFoo)
  }

  getValue(): State { ... }
  setValue(state: State): void { this.#state = state; this.#render() }
  onChange(cb: (state: State) => void): () => void { /* return unsubscribe fn */ }

  destroy(): void {
    this.#root.remove()
    document.removeEventListener('selectionchange', this.#onFoo) // must remove global listeners
  }

  #render(): void { /* idempotent DOM sync — never recreate; only patch */ }
}
```

**Lifecycle rules:**
- `constructor` — create DOM, register listeners, call `#render()`
- `#render()` — private, idempotent, projects state → DOM; never recreate chrome, only patch (toggle classes/attributes)
- `destroy()` — remove created DOM, **always detach global listeners** (`document`, `window`) stored as private arrow-function fields
- Upward communication via subscription (`onChange(cb): () => void`) — fully type-safe, no `CustomEvent` dispatch

**Re-rendering rules:**
- State flows one way: event → derive new state → `_render()` → notify listeners
- For toolbar/chrome: mutate only what changed (toggle CSS classes, set `aria-pressed`) — never `innerHTML` replace
- For the rich-text area: full serializer re-render is correct (serializer owns the content)
- For future block lists: use key-based reconciliation or `morphdom` rather than full replacement

## Architecture

### 1. Text Model — `src/lib/block-editor/text/text.ts`

Immutable value object (`Text`) representing a string with typed inline annotations (`Bold`, `Italic`, `Underline`). All invariants are enforced at construction time:

- Same-type inlines never overlap or touch (merge semantics in `addInline`).
- All ranges are bounded: `0 ≤ start < end ≤ text.length`.
- Inlines are always sorted (start asc, end desc).

Key methods: `addInline`, `removeInline`, `isToggled`. Every mutating method returns a new `Text` instance.

`InlineDtoMap` is a discriminated union — **adding a new inline type requires updating `InlineDtoMap`**, which propagates exhaustiveness errors automatically to the serializer and any other exhaustive switch.

### 2. Text Serializer — `src/lib/block-editor/text/serializer.ts`

Bidirectional conversion between `Text` and arrays of DOM nodes.

- **Render:** `buildSegments()` splits text into contiguous segments sharing the same active inline stack, then `renderSegments()` recursively wraps them in the correct tags. Nesting order: longer (outer) inlines wrap shorter (inner) ones.
- **Parse:** `parseNode()` recursively walks DOM nodes, accumulating text and inline annotations. Zero-length inlines are skipped.
- Tag mapping: `Bold ↔ <strong>`, `Italic ↔ <em>`, `Underline ↔ <u>`.

### 3. Editor — `src/lib/block-editor/editor/`

`TextEditor` is a self-contained UI component. It imports its CSS, builds a toolbar + `contenteditable` div, and wires everything together.

- `#render()` serializes the current `Text` state to DOM and restores selection.
- `#handleInput()` parses the edited DOM back to `Text` and calls change listeners.
- `#applyOrRemoveInline()` toggles formatting on the current selection using `isToggled`.
- Selection is mapped between DOM positions and character offsets via `getCharOffset` / `findNodeAtOffset`.
- IME composition events are handled separately to avoid premature parses.

### 4. Public API — `src/lib/block-editor/index.ts`

All classes and types intended for consumers must be exported from `index.ts`. When adding a new public class or type, add it here.

## Blocks API

### Tree navigation
`Blocks` exposes three instance methods for positional queries:
- `parent(id)` — parent block ID, or `null` for root blocks
- `prevSibling(id)` — previous sibling ID, or `null` if first child
- `nextSibling(id)` — next sibling ID, or `null` if last child

All three throw if the `id` is not found.

### Structural diffing
`Blocks.diff(oldBlocks, newBlocks): BlocksChange[]` returns the structural differences between two states:
- `{ type: 'removed', id }` — block present in old, absent in new
- `{ type: 'moved', id, previousBlockId, parentBlockId }` — block whose parent or prevSibling changed

Newly added blocks (not in old state) are ignored. Use this to compute `blockRemoved` and `blockMoved` events.

### Domain-logic boundary rule
**Tree-traversal and change-detection belong in `Blocks`, not in `BlockEditor` or any component.** If you need to know a block's parent, siblings, or what changed between two states, use the `Blocks` methods above — never re-implement traversal in the editor.

## Event Infrastructure

`BlockEventEmitter` (`editor/BlockEventEmitter.ts`) is the single owner of:
- Typed `addEventListener` / unsubscribe
- Immediate `emit`
- Debounced `scheduleDataUpdated` (with `flushDataUpdated`, `cancelDataUpdated`, `flushAll`, `cancelAll`)

`BlockEditor` holds a single `#emitter: BlockEventEmitter` — it never manages listener maps or timers directly.

`BLOCK_EDITOR_EVENT_NAMES` (exported from `events.ts` and `index.ts`) is a compile-time-exhaustive tuple of all event names. Use it in tests and any code that must handle every event type.
