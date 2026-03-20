import { Text, type InlineTypes } from '../text/text'
import { textSerializer } from '../text/serializer'
import { Blocks, type BlockId, type BlockTypes, type BlocksChange, BlockOffset, BlockRange, BlockDataChanged, BlockAdded, BlockRemoved, BlockMoved, OrderedListBlock } from '../blocks/blocks'
import { blocksSerializer } from '../blocks/serializer'
import type { BlockEditorEventDtoMap, BlockEditorOptions, BlockSelection } from './events'
import { BlockEventEmitter } from './BlockEventEmitter'
import { BlockHistory } from './BlockHistory'
import './block-editor.css'

export { BlockOffset, BlockRange } from '../blocks/blocks'
export type { BlockSelection } from './events'

// ─── DOM helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the character offset of `targetOffset` within `targetNode`,
 * counted from the start of `root` using only text nodes.
 * Returns -1 if `targetNode` is not found within `root`.
 */
function getCharOffset(root: Node, targetNode: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = 0

  let node: Node | null = walker.nextNode()
  while (node !== null) {
    if (node === targetNode) {
      return offset + targetOffset
    }
    offset += (node.textContent ?? '').length
    node = walker.nextNode()
  }

  if (targetNode === root) return targetOffset
  return -1
}

/**
 * Finds the text node and local offset corresponding to a character offset
 * within `root`.
 */
function findNodeAtOffset(root: Node, targetOffset: number): { node: globalThis.Text; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let accumulated = 0

  let node: Node | null = walker.nextNode()
  while (node !== null) {
    const len = (node.textContent ?? '').length
    if (accumulated + len >= targetOffset) {
      return { node: node as globalThis.Text, offset: targetOffset - accumulated }
    }
    accumulated += len
    node = walker.nextNode()
  }

  const last = walker.currentNode
  if (last && last.nodeType === Node.TEXT_NODE) {
    return { node: last as globalThis.Text, offset: (last.textContent ?? '').length }
  }

  return { node: root as unknown as globalThis.Text, offset: 0 }
}

/** Walks ancestors to find the nearest `.block` element. */
function getBlockElement(node: Node): Element | null {
  let current: Node | null = node
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).classList.contains('block')) {
      return current as Element
    }
    current = current.parentNode
  }
  return null
}

/** Returns the direct `<p>` child of a block element. */
function getBlockElementContent(blockEl: Element): Element {
  for (const child of Array.from(blockEl.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === 'p') {
      return child as Element
    }
  }
  throw new Error(`Block element '${blockEl.id}' is missing its <p> child`)
}

/** Inserts a single character into a Text at the given offset. */
function insertChar(text: Text, offset: number, char: string): Text {
  const [left, right] = text.split(offset)
  return Text.merge(Text.merge(left, new Text(char, [])), right)
}

// ─── BlockEditor ─────────────────────────────────────────────────────────────

export class BlockEditor {
  #state: Blocks
  #history: BlockHistory
  #editable: HTMLDivElement
  #emitter: BlockEventEmitter
  /**
   * IME composition guard.
   * Set true on compositionstart, false on compositionend.
   * #handleInput is a no-op while composing, then fires once on compositionend.
   */
  #composing = false
  #pendingSelectionBefore: BlockSelection | null = null

  #onSelectionChange = (): void => {
    if (document.activeElement === this.#editable) {
      this.#emitter.emit('selectionChange', this.#getSelection())
    }
  }

  #onBlur = (): void => {
    this.#emitter.flushAll()
    this.#emitter.emit('selectionChange', null)
  }

  constructor(container: HTMLElement, initial?: Blocks, opts: BlockEditorOptions = {}) {
    this.#state = initial ?? Blocks.from([Blocks.createTextBlock()])
    this.#history = new BlockHistory(this.#state)
    this.#emitter = new BlockEventEmitter(
      (id) => {
        try {
          const block = this.#state.getBlock(id)
          const blockType: BlockTypes = block instanceof OrderedListBlock ? 'ordered-list' : 'text'
          return { id, data: block.data, blockType }
        } catch {
          return null  // block was removed; skip
        }
      },
      {
        debounceMs: opts.dataUpdateDebounceMs ?? 1000,
        maxWaitMs:  opts.dataUpdateMaxWaitMs  ?? 10000,
      },
    )

    this.#editable = document.createElement('div')
    this.#editable.className = 'block-editor-editable'
    this.#editable.contentEditable = 'true'

    this.#editable.addEventListener('keydown', (e) => this.#handleKeyDown(e))
    this.#editable.addEventListener('input', () => this.#handleInput())
    this.#editable.addEventListener('blur', this.#onBlur)
    this.#editable.addEventListener('compositionstart', () => {
      // If there is a multi-block selection, delete it before composition starts
      const sel = this.#getSelection()
      this.#pendingSelectionBefore = sel
      if (sel instanceof BlockRange) {
        const cursor = this.#deleteRange(sel)
        this.#render(cursor)
      }
      this.#composing = true
    })
    this.#editable.addEventListener('compositionend', () => {
      this.#composing = false
      this.#handleInput()
    })

    document.addEventListener('selectionchange', this.#onSelectionChange)

    container.appendChild(this.#editable)
    this.#render()
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getValue(): Blocks {
    return this.#state
  }

  setValue(blocks: Blocks): void {
    this.#emitter.cancelAll()
    this.#state = blocks
    this.#render()
    // no events
  }

  /** Registers a typed event listener. Returns an unsubscribe function. */
  addEventListener<K extends keyof BlockEditorEventDtoMap>(
    event: K,
    handler: (payload: BlockEditorEventDtoMap[K]) => void,
  ): () => void {
    return this.#emitter.addEventListener(event, handler)
  }

  /** Indent current block range; re-render preserving full BlockSelection. */
  indent(): void {
    const sel = this.#getSelection()
    if (!sel) return
    this.#pendingSelectionBefore = sel
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId = sel instanceof BlockRange ? sel.end.blockId : sel.blockId
    const oldState = this.#state
    this.#state = this.#state.indent(fromId, toId)
    this.#render(sel)
    this.#emitEvents(oldState)
  }

  /** Unindent current block range; re-render preserving full BlockSelection. */
  outdent(): void {
    const sel = this.#getSelection()
    if (!sel) return
    this.#pendingSelectionBefore = sel
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId = sel instanceof BlockRange ? sel.end.blockId : sel.blockId
    const oldState = this.#state
    this.#state = this.#state.unindent(fromId, toId)
    this.#render(sel)
    this.#emitEvents(oldState)
  }

  /** Converts all blocks in the current selection to `newType`. */
  convertBlockType(newType: BlockTypes): void {
    const sel = this.#getSelection()
    if (!sel) return
    this.#pendingSelectionBefore = sel
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId   = sel instanceof BlockRange ? sel.end.blockId   : sel.blockId
    const oldState = this.#state
    this.#state = this.#state.convertType(fromId, toId, newType)
    this.#render(sel)
    this.#emitEvents(oldState)
  }

  /**
   * Returns true only when every block in the current selection is `type`.
   * Returns false for no selection or a mixed selection.
   */
  isBlockTypeActive(type: BlockTypes): boolean {
    const sel = this.#getSelection()
    if (!sel) return false
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId   = sel instanceof BlockRange ? sel.end.blockId   : sel.blockId
    try {
      let id: BlockId | null = fromId
      while (id !== null) {
        const block = this.#state.getBlock(id)
        const actual: BlockTypes = block instanceof OrderedListBlock ? 'ordered-list' : 'text'
        if (actual !== type) return false
        if (id === toId) break
        id = this.#state.nextBlockId(id)
      }
      return true
    } catch {
      return false
    }
  }

  /** Toggle inline format on selection within focused block. */
  toggleInline(type: InlineTypes): void {
    const sel = this.#getSelection()
    if (!sel) return

    let blockId: BlockId
    let start: number
    let end: number

    if (sel instanceof BlockRange && sel.start.blockId === sel.end.blockId) {
      blockId = sel.start.blockId
      start = sel.start.offset
      end = sel.end.offset
    } else {
      // Multi-block or collapsed — no-op
      return
    }

    const block = this.#state.getBlock(blockId)
    const text = block.getText()
    if (start >= end || end > text.text.length) return

    const toggled = text.isToggled(type, start, end)
    const newText = toggled
      ? text.removeInline(type, start, end)
      : text.addInline(type, start, end)

    const oldState = this.#state
    this.#state = this.#state.update(blockId, newText)
    this.#render(sel)
    this.#emitEvents(oldState)
  }

  /** Returns true if the inline is fully active on the current selection. */
  isInlineActive(type: InlineTypes): boolean {
    const sel = this.#getSelection()
    if (!(sel instanceof BlockRange)) return false
    if (sel.start.blockId !== sel.end.blockId) return false

    const block = this.#state.getBlock(sel.start.blockId)
    const start = sel.start.offset
    const end = sel.end.offset
    if (start >= end || end > block.getText().text.length) return false

    try {
      return block.getText().isToggled(type, start, end)
    } catch {
      return false
    }
  }

  canUndo(): boolean { return this.#history.canUndo() }
  canRedo(): boolean { return this.#history.canRedo() }

  undo(): void {
    if (!this.#history.canUndo()) return
    const oldState = this.#state
    const { blocks, selection } = this.#history.undo()
    this.#state = blocks
    this.#render(selection ?? undefined)
    this.#dispatchChanges(Blocks.diff(oldState, this.#state))
  }

  redo(): void {
    if (!this.#history.canRedo()) return
    const oldState = this.#state
    const { blocks, selection } = this.#history.redo()
    this.#state = blocks
    this.#render(selection ?? undefined)
    this.#dispatchChanges(Blocks.diff(oldState, this.#state))
  }

  /**
   * Removes the editor DOM from the page and detaches the global
   * `document` `selectionchange` listener added in the constructor.
   * Flushes any pending debounced events before tearing down.
   */
  destroy(): void {
    this.#emitter.flushAll()
    this.#emitter.cancelAll()
    document.removeEventListener('selectionchange', this.#onSelectionChange)
    this.#editable.remove()
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  #dispatchChanges(changes: BlocksChange[]): void {
    this.#emitter.cancelAll()

    // Emit in a stable semantic order: dataChanged → added → removed → moved
    for (const change of changes) {
      if (change instanceof BlockDataChanged) {
        this.#emitter.emit('blockDataUpdated', { id: change.id, data: change.data, blockType: change.blockType })
      }
    }
    for (const change of changes) {
      if (change instanceof BlockAdded) {
        this.#emitter.emit('blockCreated', { id: change.id, data: change.data, previousBlockId: change.previousBlockId, parentBlockId: change.parentBlockId })
      }
    }
    for (const change of changes) {
      if (change instanceof BlockRemoved) {
        this.#emitter.emit('blockRemoved', { id: change.id })
      }
    }
    for (const change of changes) {
      if (change instanceof BlockMoved) {
        this.#emitter.emit('blockMoved', { id: change.id, previousBlockId: change.previousBlockId, parentBlockId: change.parentBlockId })
      }
    }
  }

  #emitEvents(oldState: Blocks): void {
    const changes = Blocks.diff(oldState, this.#state)
    if (changes.length > 0) {
      const selAfter = this.#getSelection()
      this.#history.add(changes, this.#pendingSelectionBefore, selAfter)
    }
    this.#pendingSelectionBefore = null
    this.#dispatchChanges(changes)
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  #render(selection?: BlockSelection): void {
    const focused = document.activeElement === this.#editable

    let savedSel: BlockSelection | undefined = selection
    if (savedSel === undefined && focused) {
      savedSel = this.#getSelection() ?? undefined
    }

    this.#editable.innerHTML = ''
    const nodes = blocksSerializer.render(this.#state)
    for (const node of nodes) {
      this.#editable.appendChild(node)
    }

    // Restore when selection was explicitly passed, or when we saved it because we were focused
    if (savedSel !== undefined) {
      try {
        this.#restoreSelection(savedSel)
      } catch {
        // best-effort
      }
    }
  }

  #restoreSelection(sel: BlockSelection): void {
    const domSel = window.getSelection()
    if (!domSel) return

    const range = document.createRange()

    if (sel instanceof BlockOffset) {
      const blockEl = this.#editable.querySelector(`[id="${sel.blockId}"]`)
      if (!blockEl) return
      const p = getBlockElementContent(blockEl)
      const { node, offset } = findNodeAtOffset(p, sel.offset)
      range.setStart(node, offset)
      range.setEnd(node, offset)
    } else {
      const startBlockEl = this.#editable.querySelector(`[id="${sel.start.blockId}"]`)
      const endBlockEl = this.#editable.querySelector(`[id="${sel.end.blockId}"]`)
      if (!startBlockEl || !endBlockEl) return
      const startP = getBlockElementContent(startBlockEl)
      const endP = getBlockElementContent(endBlockEl)
      const startPos = findNodeAtOffset(startP, sel.start.offset)
      const endPos = findNodeAtOffset(endP, sel.end.offset)
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset)
    }

    domSel.removeAllRanges()
    domSel.addRange(range)
  }

  #getSelection(): BlockSelection | null {
    const domSel = window.getSelection()
    if (!domSel || domSel.rangeCount === 0) return null

    const range = domSel.getRangeAt(0)
    if (!this.#editable.contains(range.startContainer)) return null
    if (!this.#editable.contains(range.endContainer)) return null

    const startBlockEl = getBlockElement(range.startContainer)
    const endBlockEl = getBlockElement(range.endContainer)
    if (!startBlockEl || !endBlockEl) return null

    const startBlockId = startBlockEl.id
    const endBlockId = endBlockEl.id

    const startP = getBlockElementContent(startBlockEl)
    const endP = getBlockElementContent(endBlockEl)

    const startOffset = getCharOffset(startP, range.startContainer, range.startOffset)
    const endOffset = getCharOffset(endP, range.endContainer, range.endOffset)

    if (startOffset === -1 || endOffset === -1) return null

    if (range.collapsed) {
      return new BlockOffset(startBlockId, startOffset)
    }

    // If same block and same offset (shouldn't happen for non-collapsed, but guard)
    if (startBlockId === endBlockId && startOffset === endOffset) {
      return new BlockOffset(startBlockId, startOffset)
    }

    return new BlockRange(
      new BlockOffset(startBlockId, startOffset),
      new BlockOffset(endBlockId, endOffset),
    )
  }

  #handleKeyDown(e: KeyboardEvent): void {
    if (this.#composing) return

    // Undo: Ctrl/Cmd+Z
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      this.undo()
      return
    }

    // Redo: Ctrl/Cmd+Shift+Z or Ctrl+Y
    if (
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
      (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'y')
    ) {
      e.preventDefault()
      this.redo()
      return
    }

    const sel = this.#getSelection()
    this.#pendingSelectionBefore = sel

    if (e.key === 'Enter') {
      e.preventDefault()
      if (sel) this.#handleEnter(sel)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) this.outdent()
      else this.indent()
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      this.toggleInline('Bold')
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      this.toggleInline('Italic')
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault()
      this.toggleInline('Underline')
      return
    }

    if (e.key === 'Backspace') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        this.#handleBackspace(sel)
        return
      }
      if (sel instanceof BlockOffset && sel.offset === 0) {
        e.preventDefault()
        this.#handleBackspace(sel)
        return
      }
      return
    }

    if (e.key === 'Delete') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        this.#handleDelete(sel)
        return
      }
      if (sel instanceof BlockOffset) {
        const block = this.#state.getBlock(sel.blockId)
        if (sel.offset === block.getLength()) {
          e.preventDefault()
          this.#handleDelete(sel)
          return
        }
      }
      return
    }

    // Printable char with BlockRange → delete range then insert char
    if (
      sel instanceof BlockRange &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      const cursor = this.#deleteRange(sel)
      const block = this.#state.getBlock(cursor.blockId)
      const text = block.getText()
      const newText = insertChar(text, cursor.offset, e.key)
      const newCursor = new BlockOffset(cursor.blockId, cursor.offset + 1)
      this.#state = this.#state.update(cursor.blockId, newText)
      this.#render(newCursor)
      this.#emitter.scheduleDataUpdated(cursor.blockId)
      return
    }
  }

  #handleInput(): void {
    if (this.#composing) return

    const sel = this.#getSelection()
    if (sel instanceof BlockRange) {
      throw new Error('BlockEditor invariant violated: multi-block selection during input')
    }
    if (!sel) return

    const { blockId } = sel
    const blockEl = this.#editable.querySelector(`[id="${blockId}"]`)
    if (!blockEl) return

    const pEl = getBlockElementContent(blockEl)
    const newText = textSerializer.parse(Array.from(pEl.childNodes))
    this.#state = this.#state.update(blockId, newText)
    const blockType: BlockTypes = this.#state.getBlock(blockId) instanceof OrderedListBlock ? 'ordered-list' : 'text'
    this.#history.updateOrAdd(blockId, new BlockDataChanged(blockId, newText, blockType), this.#pendingSelectionBefore, sel)
    this.#pendingSelectionBefore = null
    this.#render(sel)
    this.#emitter.scheduleDataUpdated(blockId)
  }

  #handleEnter(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this.#deleteRange(sel)
      this.#render(cursor)
      return
    }
    // BlockOffset: split
    const { blockId, offset } = sel
    const block = this.#state.getBlock(blockId)
    const atEnd = offset === block.getLength()

    if (atEnd) {
      this.#emitter.flushDataUpdated(blockId)
    }

    const oldState = this.#state
    const newId = crypto.randomUUID()
    this.#state = this.#state.splitAt(blockId, offset, newId)
    this.#render(new BlockOffset(newId, 0))
    this.#emitEvents(oldState)
  }

  #handleBackspace(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this.#deleteRange(sel)
      this.#render(cursor)
      return
    }
    // BlockOffset at offset 0
    const { blockId } = sel
    const prevId = this.#state.previousBlockId(blockId)
    if (prevId === null) return  // first block — no-op
    const cursorOffset = this.#state.getBlock(prevId).getLength()
    const oldState = this.#state
    this.#state = this.#state.merge(prevId, blockId)
    this.#render(new BlockOffset(prevId, cursorOffset))
    this.#emitEvents(oldState)
  }

  #handleDelete(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this.#deleteRange(sel)
      this.#render(cursor)
      return
    }
    // BlockOffset at end of block
    const { blockId } = sel
    const nextId = this.#state.nextBlockId(blockId)
    if (nextId === null) return  // last block — no-op
    const cursorOffset = this.#state.getBlock(blockId).getLength()
    const oldState = this.#state
    this.#state = this.#state.merge(blockId, nextId)
    this.#render(new BlockOffset(blockId, cursorOffset))
    this.#emitEvents(oldState)
  }

  #deleteRange(sel: BlockRange): BlockOffset {
    if (sel.start.blockId === sel.end.blockId) {
      const block = this.#state.getBlock(sel.start.blockId)
      const text = block.getText()
      const length = sel.end.offset - sel.start.offset
      const newText = text.remove(sel.start.offset, length)
      const oldState = this.#state
      this.#state = this.#state.update(sel.start.blockId, newText)
      this.#emitEvents(oldState)
      return new BlockOffset(sel.start.blockId, sel.start.offset)
    }
    // Multi-block
    const oldState = this.#state
    this.#state = this.#state.deleteRange(sel)
    this.#emitEvents(oldState)
    return new BlockOffset(sel.start.blockId, sel.start.offset)
  }
}
