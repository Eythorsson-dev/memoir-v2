# Block Editor Library

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

## Private Fields

Use **JavaScript native `#` private fields** for all private class members. Do not use TypeScript's `private` keyword or the `_` prefix convention. Use `protected` for subclass-accessible members.

- When accessing a private **static** `#` field, always reference it via the class name — never via `this` — to avoid a `TypeError` when the method is inherited.

## Component Patterns

All UI components follow a **class-based pattern**.

**Re-rendering rules:**
- State flows one way: event → derive new state → `_render()` → notify listeners
- For toolbar/chrome: mutate only what changed (toggle CSS classes, set `aria-pressed`) — never `innerHTML` replace
- For the rich-text area: full serializer re-render is correct (serializer owns the content)
- For future block lists: use key-based reconciliation or `morphdom` rather than full replacement

## Public API

All classes and types intended for consumers must be exported from `index.ts`.

## Inline Types

`InlineDtoMap` is a discriminated union — **adding a new inline type requires updating `InlineDtoMap`**, which propagates exhaustiveness errors automatically to the serializer and any other exhaustive switch.

## Blocks: Domain-Logic Boundary

**Tree-traversal and change-detection belong in `Blocks`, not in `BlockEditor` or any component.** If you need to know a block's parent, siblings, or what changed between two states, use the `Blocks` methods — never re-implement traversal in the editor.

## Event Infrastructure

`BlockEventEmitter` (`editor/BlockEventEmitter.ts`) is the single owner of:
- Typed `addEventListener` / unsubscribe
- Immediate `emit`
- Debounced `scheduleDataUpdated` (with `flushDataUpdated`, `cancelDataUpdated`, `flushAll`, `cancelAll`)

`BlockEditor` holds a single `#emitter: BlockEventEmitter` — it never manages listener maps or timers directly.

`BLOCK_EDITOR_EVENT_NAMES` (exported from `events.ts` and `index.ts`) is a compile-time-exhaustive tuple of all event names. Use it in tests and any code that must handle every event type.