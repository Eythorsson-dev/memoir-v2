# Plan: BlockEditor

## Goal

Build a `BlockEditor` UI component that renders and edits a `Blocks` tree inside a single
`contenteditable` div, replacing the single-block `TextEditor` in the demo.

---

## DOM structure

The `contenteditable` root contains the output of `blocksSerializer.render()` directly:

```html
<div contenteditable="true" class="block-editor-editable">
  <div class="block" id="block-1">
    <p>AAA</p>
  </div>
  <div class="block" id="block-2">
    <p>BBBB</p>
    <div class="children">
      <div class="block" id="block-3">
        <p>CC</p>
      </div>
    </div>
  </div>
</div>
```

`blocksSerializer.render()` and `blocksSerializer.parse()` are the only serialization path.
No custom render or parse logic lives in `BlockEditor`.

---

## Selection model

A **block-aware selection** is represented as:

```ts
type BlockSelection = {
  startBlockId: string
  startOffset: number   // character offset within that block's <p>
  endBlockId: string
  endOffset: number
}
```

Helper functions (pure, unit-testable):

- `getBlockSelection(root, domSel)` → `BlockSelection | null`
  - Walk up from `domSel.startContainer` to find the nearest `.block` ancestor → `startBlockId`
  - Use `getCharOffset(pElement, startContainer, startOffset)` for the text offset
  - Same for end
- `restoreBlockSelection(root, sel)` → sets DOM selection
  - Find block element by id, find its `<p>`, use `findNodeAtOffset`
- `getBlockElement(root, id)` → `Element | null`
- `getPElement(blockEl)` → `Element` — the `<p>` child of a block element
- `getBlocksInSelectionOrder(root, sel)` → `string[]` — all block IDs between start and end
  (in DOM tree order, includes partial blocks at boundaries)

---

## Key event handling

All structural key events use `preventDefault()`. Regular character input is handled by the
browser inside `<p>` tags, then parsed on the `input` event.

### Enter

**Collapsed cursor (no selection):**
1. Find current block and cursor offset.
2. `text.split(offset)` → `[left, right]`
3. Update current block with `left`.
4. Generate a new block ID, create `Block(newId, right, [])`.
5. `blocks.addAfter(currentBlockId, newBlock)`
6. Re-render, place cursor at offset 0 of new block.

**Multi-block selection:**
1. Resolve selection → `{ startBlockId, startOffset, endBlockId, endOffset }`
2. Delete the selection (see "Delete selection" below).
3. The result is a single merged block at `startBlock`'s position.
4. Split that merged block at `startOffset` using `text.split(startOffset)`.
5. Re-render, place cursor at offset 0 of the second block.

### Backspace

**Collapsed cursor at offset > 0:**  Let browser handle (delete one character). Parse on `input`.

**Collapsed cursor at offset 0 (block boundary):**
1. Find the previous block in flat tree order.
2. If none → no-op.
3. Merge: `Text.merge(prevBlock.data, currentBlock.data)` → merged text.
4. New merged block = `Block(prevBlockId, mergedText, [...prevBlock.children, ...currentBlock.children])`.
5. Remove `currentBlock`. Update `prevBlock` with merged block.
6. Re-render, place cursor at `prevBlock.data.text.length` (the join point).

**Multi-block selection:**  Apply "Delete selection" (see below).

### Delete

**Collapsed cursor at end of block:**
1. Find next block in flat tree order.
2. If none → no-op.
3. Same merge logic as Backspace boundary case, cursor stays at current offset.

**Multi-block selection:**  Apply "Delete selection" (see below).

### Character input on multi-block selection

1. `preventDefault()`
2. Apply "Delete selection".
3. Insert the typed character at the collapsed cursor position (let browser handle via a
   synthetic re-render into the collapsed block, or insert directly into `Text`).

---

## Delete selection (shared logic)

Given `{ startBlockId, startOffset, endBlockId, endOffset }`:

```
AAA
 BBBB
  CC[CC        ← startBlock = CC, startOffset = 2
DD]DD           ← endBlock = DD, endOffset = 2
 EEEE
FFFF
```

Steps:

1. **Collect all blocks in selection order** (flat tree walk between start and end, inclusive).
   Label them:
   - `startBlock` — partially selected at the start
   - `endBlock` — partially selected at the end
   - `middleBlocks` — everything between them (fully selected)

2. **Compute merged text:**
   ```
   left  = startBlock.data.split(startOffset)[0]   // "CC"
   right = endBlock.data.split(endOffset)[1]        // "DD"
   merged = Text.merge(left, right)                 // "CCDD"
   ```

3. **Compute merged children:**
   ```
   mergedChildren = [...startBlock.children, ...endBlock.children]
   ```
   (Children of fully-selected middle blocks are discarded along with their parents.)

4. **Build new block:**  `Block(startBlock.id, merged, mergedChildren)`

5. **Apply to `Blocks` tree:**
   - Update startBlock with new data + children.
   - Delete all middle blocks (leaf-first if they have children — but since their children
     are discarded, delete from innermost out, or process in reverse tree order).
   - Delete endBlock.
   - Result cursor position: `startOffset` in `startBlock`.

---

## BlockEditor class

```
src/editor/BlockEditor.ts
```

```ts
export class BlockEditor {
  private _state: Blocks
  private _editable: HTMLDivElement
  private _toolbar: HTMLDivElement
  private _listeners: Set<(b: Blocks) => void>
  private _composing: boolean

  constructor(container: HTMLElement, initial: Blocks)
  getValue(): Blocks
  setValue(blocks: Blocks): void
  onChange(cb: (b: Blocks) => void): () => void
  destroy(): void

  private _render(savedSel?: BlockSelection): void
  private _handleInput(): void
  private _handleKeyDown(e: KeyboardEvent): void
  private _applyOrRemoveInline(type: InlineTypes): void
  private _getBlockSelection(): BlockSelection | null
  private _restoreBlockSelection(sel: BlockSelection): void
  private _notify(): void
}
```

Toolbar is identical to `TextEditor` (Bold / Italic / Underline), but `_applyOrRemoveInline`
iterates over all blocks in the selection and applies the inline to each.

---

## ID generation

Use a simple incrementing counter (`let nextId = 1; () => String(nextId++)`).
No external dependency needed.

---

## Demo update

`src/demo.ts`:
- Replace `TextEditor` + single `Text` with `BlockEditor` + initial `Blocks`.
- JSON output shows `blocks.blocks.map(b => b.toDTO())` (or equivalent).

`index.html`:
- No structural changes needed.

---

## Implementation order (TDD)

Each step: write failing test → implement → confirm green → commit.

1. **Pure helper functions** (`src/editor/blockEditorHelpers.ts`)
   - `getBlockElement`, `getPElement`, `getBlocksInSelectionOrder`
   - `getBlockSelection`, `restoreBlockSelection`

2. **`Blocks` model additions** (if needed beyond existing methods)
   - Confirm `delete` handles cases needed for multi-block removal.
   - Add `Blocks.splitBlock(id, offset): Blocks` — splits one block into two siblings.
   - Add `Blocks.mergeBlocks(startId, startOffset, endId, endOffset): { blocks: Blocks, cursorBlockId: string, cursorOffset: number }` — implements "Delete selection" logic.

3. **`BlockEditor` class** — Enter (collapsed), Backspace (boundary), basic render/parse.

4. **Multi-block selection** — Enter, Backspace, Delete, character input.

5. **Demo wiring** — update `demo.ts`.

6. **Indent / Unindent** — per the separate `indent-unindent.md` plan.

---

## Out of scope for this plan

- Undo / redo
- Block types (heading, list item, etc.) — all blocks are paragraphs for now
- Drag-and-drop reordering
- Paste handling
- Arrow-key navigation across block boundaries (browser handles this naturally)
