# 001b — BlockEditor `addEventListener` API

## Goal

Replace the existing `onChange` / `onSelectionChange` methods on `BlockEditor` (and `BlockEditorWithToolbar`) with a single typed `addEventListener` method backed by a TypeScript event map. Introduce new structural events (`blockCreated`, `blockDataUpdated`, `blockRemoved`, `blockMoved`) and debounce text-change notifications.

**Prerequisite:** Phase 1 (001a) must be merged first — `demo.ts` is updated here to use the new API.

---

## New demo component: `EventLogPanel`

This phase adds the Event Log panel to the inspector, which requires `addEventListener` to be meaningful. It lives alongside the `JsonPanel` and `CollapsibleSection` components created in Phase 1.

```typescript
// src/demo/components/EventLogPanel.ts

export class EventLogPanel {
  private _section: CollapsibleSection
  private _list: HTMLDivElement
  private _maxEntries: number

  constructor(title: string, storageKey: string, maxEntries = 50) { … }

  append(name: string, payload: unknown): void {
    const time      = new Date().toTimeString().slice(0, 8)
    const entry     = document.createElement('div')
    entry.className = 'log-entry'
    // Uses textContent (not innerHTML) to avoid XSS from payload values
    const timeEl    = document.createElement('span')
    const nameEl    = document.createElement('span')
    const payloadEl = document.createElement('span')
    timeEl.className    = 'log-time'
    nameEl.className    = 'log-name'
    payloadEl.className = 'log-payload'
    timeEl.textContent    = time
    nameEl.textContent    = name
    payloadEl.textContent = JSON.stringify(payload)
    entry.append(timeEl, nameEl, payloadEl)
    this._list.prepend(entry)
    while (this._list.children.length > this._maxEntries) {
      this._list.lastElementChild!.remove()
    }
  }

  mount(parent: HTMLElement): this { … }
}
```

Entry layout CSS:
```css
.log-entry {
  display: grid;
  grid-template-columns: 5rem 10rem 1fr;
  gap: 0.5rem;
  padding: 2px 0;
  border-bottom: 1px solid var(--border);
  font-family: monospace;
  font-size: 0.8rem;
}
.log-time    { color: var(--toolbar-fg); }
.log-name    { font-weight: 600; color: var(--toolbar-btn-active-color); }
.log-payload { word-break: break-all; }
```

The layout diagram for the completed inspector (both phases):

```
│  Inspector pane       │
│  ▼ Selection          │  ← JsonPanel      (Phase 1)
│  ▼ State JSON         │  ← JsonPanel      (Phase 1)
│  ▼ Event Log          │  ← EventLogPanel  (Phase 2)
```

---

## Event Map (TypeScript)

```typescript
// src/editor/events.ts

export type BlockEditorEventMap = {
  selectionChange:  BlockSelection | null
  blockCreated:     BlockCreatedEvent
  blockDataUpdated: BlockDataUpdatedEvent
  blockRemoved:     BlockRemovedEvent
  blockMoved:       BlockMovedEvent
}
```

### Event payloads

```typescript
export type BlockCreatedEvent = {
  id:              BlockId
  previousBlockId: BlockId | null  // null if the new block is first in its parent
  parentBlockId:   BlockId | null  // null if top-level
}

export type BlockDataUpdatedEvent = {
  id:   BlockId
  data: TextDto          // the new text content of the block
}

export type BlockRemovedEvent = {
  id: BlockId
}

export type BlockMovedEvent = {
  id:              BlockId
  previousBlockId: BlockId | null  // block now directly before this one
  parentBlockId:   BlockId | null  // null if top-level
}
```

---

## API

```typescript
// Registers a typed handler and returns an unsubscribe function.
addEventListener<K extends keyof BlockEditorEventMap>(
  event: K,
  handler: (payload: BlockEditorEventMap[K]) => void
): () => void
```

The returned function, when called, removes that specific handler.

---

## Debouncing `blockDataUpdated`

`blockDataUpdated` is **not** fired on every keystroke. It is debounced so it fires only after the user stops typing. All other events fire immediately.

### Recommended settings

| Parameter | Value | Rationale |
|---|---|---|
| `wait` | **1 000 ms** | Standard for rich-text editors (CKEditor 5 default). |
| `maxWait` | **10 000 ms** | Forces a flush every 10 s even during continuous typing. |

Both are configurable on the constructor:

```typescript
export interface BlockEditorOptions {
  /** Base debounce delay for blockDataUpdated in ms. Default: 1000. */
  dataUpdateDebounceMs?: number
  /** Maximum forced-flush interval in ms. Default: 10000. */
  dataUpdateMaxWaitMs?: number
}
```

### Flush points

The debounce must be flushed immediately in three situations:

1. **Editor loses focus** (`blur`) — user moved away; save what they typed.
2. **Before structural events** — when `blockRemoved` or `blockCreated` fires on the same block, flush any pending `blockDataUpdated` for that block first so consumers always receive the final text before structural events.
3. **Editor destroyed** — flush then cancel to avoid post-teardown calls.

### Implementation note

Use `ts-debounce` (type-safe, supports `maxWait`, exposes `.flush()` and `.cancel()`). Store one debounced emitter per active block:

```typescript
private _pendingDataUpdates: Map<BlockId, DebouncedFunction<() => void>>
```

---

## Event Scenarios with Examples

### 1. Text edit (user types in a block)

`blockDataUpdated` fires ~1 s after the user stops typing, not on every keystroke.

```
→ blockDataUpdated { id: 'abc', data: { text: 'Hello!', inline: [] } }
```

### 2. Selection change

Fires immediately whenever the caret or selection moves.

```
→ selectionChange  BlockOffset { blockId: 'abc', offset: 3 }
→ selectionChange  BlockRange  { start: BlockOffset('abc', 0), end: BlockOffset('def', 5) }
→ selectionChange  null   // editor loses focus
```

### 3. Enter key pressed mid-block (block split)

Pending `blockDataUpdated` for the original block is flushed before structural events.

```
// Before: block 'abc' contains "Hello World", cursor after "Hello"
→ blockDataUpdated { id: 'abc', data: { text: 'Hello', inline: [] } }  // flushed early
→ blockCreated     { id: 'xyz', previousBlockId: 'abc', parentBlockId: null }
// Block 'xyz' contains "World"
```

### 4. Enter key pressed at end of block

No text change — only a creation event fires.

```
→ blockCreated { id: 'xyz', previousBlockId: 'abc', parentBlockId: null }
```

### 5. New block inserted before an existing block

```
// Before: [abc] → [def]
// After:  [abc] → [xyz] → [def]
→ blockCreated { id: 'xyz', previousBlockId: 'abc', parentBlockId: null }
→ blockMoved   { id: 'def', previousBlockId: 'xyz', parentBlockId: null }
```

### 6. Block deleted (Backspace / Delete merge)

```
// 'def' deleted, its text appended to 'abc'
→ blockDataUpdated { id: 'abc', data: { text: 'Hello World', inline: [] } }  // flushed early
→ blockRemoved     { id: 'def' }
```

### 7. Indent

```
→ blockMoved { id: 'def', previousBlockId: null, parentBlockId: 'abc' }
```

### 8. Outdent

```
→ blockMoved { id: 'def', previousBlockId: 'abc', parentBlockId: null }
```

### 9. Editor loses focus

```
→ blockDataUpdated { id: 'abc', data: { text: 'Unsaved text', inline: [] } }
→ selectionChange  null
```

---

## Implementation Steps

### Step 1 — Add `ts-debounce` dependency

```bash
pnpm add ts-debounce
```

### Step 2 — Define event types

Create `src/editor/events.ts` with `BlockEditorEventMap`, all payload types, and `BlockEditorOptions`.

### Step 3 — Refactor `BlockEditor` internals

- Replace `_listeners: Set<...>` and `_selectionListeners: Set<...>` with:
  ```typescript
  private _listeners: Map<keyof BlockEditorEventMap, Set<Function>>
  private _pendingDataUpdates: Map<BlockId, DebouncedFunction<() => void>>
  ```
- Replace `onChange` and `onSelectionChange` with `addEventListener<K>`.
- Replace `_notify()` and `_notifySelectionListeners()` with a single private `_emit<K>(event, payload)`.
- Add `_scheduleDataUpdated(id, data)` — debounces per block.
- Add `_flushDataUpdated(id?)` — flushes one or all pending updates.

### Step 4 — Wire new events in `BlockEditor`

| Action | Events (in order) |
|---|---|
| User types | `blockDataUpdated` (debounced) |
| Enter at end of block | `blockCreated` |
| Enter mid-block | flush `blockDataUpdated` → `blockCreated` |
| Insert before existing | `blockCreated` + `blockMoved` |
| Backspace merges blocks | flush `blockDataUpdated` → `blockRemoved` |
| Delete merges blocks | flush `blockDataUpdated` → `blockRemoved` |
| Indent | `blockMoved` |
| Outdent | `blockMoved` |
| Selection changes | `selectionChange` (immediate) |
| Editor blur | flush all pending `blockDataUpdated` |
| Editor destroyed | flush all → cancel all |

### Step 5 — Update `BlockEditorWithToolbar`

- Delegate `addEventListener` to `_editor.addEventListener`.
- Update the internal selection listener (currently uses `onSelectionChange`) to use `addEventListener('selectionChange', ...)`.

### Step 6 — Add `EventLogPanel` and update `App.svelte`

Create `src/demo/components/event-log-panel.svelte` (see spec above). Then update `App.svelte` — replace the temporary `onChange` / `onSelectionChange` wiring with `addEventListener`, and add the event log panel to the inspector snippet:

```svelte
<!-- inside mountEditor in App.svelte -->
editor.addEventListener('selectionChange',  (sel) => { selection = sel })
editor.addEventListener('blockDataUpdated', (e)   => { blocks = e.data })

const loggedEvents = ['selectionChange','blockCreated','blockDataUpdated','blockRemoved','blockMoved'] as const
for (const name of loggedEvents) {
  editor.addEventListener(name, (payload) => { log = [{ name, payload, time: Date.now() }, ...log].slice(0, 50) })
}
```

The event log state (`log`) is a `$state` array in `App.svelte`, passed as a prop to `EventLogPanel`.

### Step 7 — Tests

- Correct event type fires for each action.
- Payload fields match the actual mutation.
- `blockDataUpdated` does **not** fire before the debounce delay expires.
- `blockDataUpdated` fires immediately on blur and before structural events.
- `blockDataUpdated` fires after `maxWait` even during continuous typing.
- Unsubscribe function stops delivery.
- No events fire after unsubscribe.

---

## Out of Scope

- Batching multiple events into a single transaction object.
- Event ordering guarantees beyond "emitted in mutation order within a flush."
- Any changes to the `Text` or `Blocks` model classes.
