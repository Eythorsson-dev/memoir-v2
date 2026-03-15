import { Text, type InlineTypes, type InlineDto } from '../text/text'
import { textSerializer } from '../text/serializer'
import { Blocks, type BlockId, BlockOffset, BlockRange, type Block } from '../blocks/blocks'
import { blocksSerializer } from '../blocks/serializer'
import type { BlockEditorEventMap, BlockEditorOptions, BlockSelection } from './events'
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

// ─── Debounce with flush/cancel ───────────────────────────────────────────────

interface DebouncedFn {
  (): void
  cancel(): void
  flush(): void
}

function makeDebounced(fn: () => void, delay: number, maxWait: number): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let pending = false

  function invoke(): void {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (maxTimer !== null) { clearTimeout(maxTimer); maxTimer = null }
    pending = false
    fn()
  }

  const debounced = Object.assign(
    function debouncedFn(): void {
      pending = true
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(invoke, delay)
      if (maxTimer === null) {
        maxTimer = setTimeout(invoke, maxWait)
      }
    },
    {
      cancel(): void {
        if (timer !== null) { clearTimeout(timer); timer = null }
        if (maxTimer !== null) { clearTimeout(maxTimer); maxTimer = null }
        pending = false
      },
      flush(): void {
        if (pending) invoke()
      },
    },
  )

  return debounced
}

// ─── BlockEditor ─────────────────────────────────────────────────────────────

export class BlockEditor {
  private _state: Blocks
  private _editable: HTMLDivElement
  private _opts: BlockEditorOptions
  private _eventListeners: Map<keyof BlockEditorEventMap, Set<(payload: unknown) => void>> = new Map()
  private _pendingDataUpdates: Map<BlockId, DebouncedFn> = new Map()
  /**
   * IME composition guard.
   * Set true on compositionstart, false on compositionend.
   * _handleInput is a no-op while composing, then fires once on compositionend.
   */
  private _composing = false

  private _onSelectionChange = (): void => {
    if (document.activeElement === this._editable) {
      this._emit('selectionChange', this._getSelection())
    }
  }

  private _onBlur = (): void => {
    this._flushAllDataUpdates()
    this._emit('selectionChange', null)
  }

  constructor(container: HTMLElement, initial?: Blocks, opts: BlockEditorOptions = {}) {
    this._state = initial ?? Blocks.from([Blocks.createBlock()])
    this._opts = opts

    this._editable = document.createElement('div')
    this._editable.className = 'block-editor-editable'
    this._editable.contentEditable = 'true'

    this._editable.addEventListener('keydown', (e) => this._handleKeyDown(e))
    this._editable.addEventListener('input', () => this._handleInput())
    this._editable.addEventListener('blur', this._onBlur)
    this._editable.addEventListener('compositionstart', () => {
      // If there is a multi-block selection, delete it before composition starts
      const sel = this._getSelection()
      if (sel instanceof BlockRange) {
        const cursor = this._deleteRange(sel)
        this._render(cursor)
      }
      this._composing = true
    })
    this._editable.addEventListener('compositionend', () => {
      this._composing = false
      this._handleInput()
    })

    document.addEventListener('selectionchange', this._onSelectionChange)

    container.appendChild(this._editable)
    this._render()
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getValue(): Blocks {
    return this._state
  }

  setValue(blocks: Blocks): void {
    this._cancelAllDataUpdates()
    this._state = blocks
    this._render()
    // no events
  }

  /** Registers a typed event listener. Returns an unsubscribe function. */
  addEventListener<K extends keyof BlockEditorEventMap>(
    event: K,
    handler: (payload: BlockEditorEventMap[K]) => void,
  ): () => void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set())
    }
    this._eventListeners.get(event)!.add(handler as (payload: unknown) => void)
    return () => this._eventListeners.get(event)?.delete(handler as (payload: unknown) => void)
  }

  /** Indent current block range; re-render preserving full BlockSelection. */
  indent(): void {
    const sel = this._getSelection()
    if (!sel) return
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId = sel instanceof BlockRange ? sel.end.blockId : sel.blockId
    const oldState = this._state
    this._state = this._state.indent(fromId, toId)
    this._render(sel)
    this._emitBlockMovedForChanges(oldState)
  }

  /** Unindent current block range; re-render preserving full BlockSelection. */
  outdent(): void {
    const sel = this._getSelection()
    if (!sel) return
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId = sel instanceof BlockRange ? sel.end.blockId : sel.blockId
    const oldState = this._state
    this._state = this._state.unindent(fromId, toId)
    this._render(sel)
    this._emitBlockMovedForChanges(oldState)
  }

  /** Toggle inline format on selection within focused block. */
  toggleInline(type: InlineTypes): void {
    const sel = this._getSelection()
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

    const block = this._state.getBlock(blockId)
    const text = new Text(block.data.text, [...block.data.inline] as InlineDto[])
    if (start >= end || end > text.text.length) return

    const toggled = text.isToggled(type, start, end)
    const newText = toggled
      ? text.removeInline(type, start, end)
      : text.addInline(type, start, end)

    this._state = this._state.update(blockId, newText)
    this._render(sel)
    this._scheduleDataUpdated(blockId)
  }

  /** Returns true if the inline is fully active on the current selection. */
  isInlineActive(type: InlineTypes): boolean {
    const sel = this._getSelection()
    if (!(sel instanceof BlockRange)) return false
    if (sel.start.blockId !== sel.end.blockId) return false

    const block = this._state.getBlock(sel.start.blockId)
    const start = sel.start.offset
    const end = sel.end.offset
    if (start >= end || end > block.data.text.length) return false

    try {
      const text = new Text(block.data.text, [...block.data.inline] as InlineDto[])
      return text.isToggled(type, start, end)
    } catch {
      return false
    }
  }

  destroy(): void {
    this._flushAllDataUpdates()
    this._cancelAllDataUpdates()
    document.removeEventListener('selectionchange', this._onSelectionChange)
    this._editable.remove()
  }

  // ─── Event emission ─────────────────────────────────────────────────────────

  private _emit<K extends keyof BlockEditorEventMap>(event: K, payload: BlockEditorEventMap[K]): void {
    const listeners = this._eventListeners.get(event)
    if (!listeners) return
    for (const cb of listeners) cb(payload as unknown)
  }

  private _scheduleDataUpdated(id: BlockId): void {
    if (!this._pendingDataUpdates.has(id)) {
      this._pendingDataUpdates.set(id, makeDebounced(
        () => this._emitDataUpdated(id),
        this._opts.dataUpdateDebounceMs ?? 1000,
        this._opts.dataUpdateMaxWaitMs ?? 10000,
      ))
    }
    this._pendingDataUpdates.get(id)!()
  }

  private _emitDataUpdated(id: BlockId): void {
    this._pendingDataUpdates.delete(id)
    try {
      const block = this._state.getBlock(id)
      this._emit('blockDataUpdated', { id, data: block.data })
    } catch {
      // block was removed; skip
    }
  }

  private _flushDataUpdated(id: BlockId): void {
    const fn = this._pendingDataUpdates.get(id)
    if (fn) fn.flush()
  }

  private _cancelDataUpdated(id: BlockId): void {
    const fn = this._pendingDataUpdates.get(id)
    if (fn) {
      fn.cancel()
      this._pendingDataUpdates.delete(id)
    }
  }

  private _flushAllDataUpdates(): void {
    for (const id of [...this._pendingDataUpdates.keys()]) {
      this._flushDataUpdated(id)
    }
  }

  private _cancelAllDataUpdates(): void {
    for (const fn of this._pendingDataUpdates.values()) {
      fn.cancel()
    }
    this._pendingDataUpdates.clear()
  }

  // ─── Tree helpers ───────────────────────────────────────────────────────────

  private _treeInfo(
    id: BlockId,
    state: Blocks,
  ): { parentId: BlockId | null; prevSiblingId: BlockId | null; nextSiblingId: BlockId | null } {
    function walk(
      blocks: ReadonlyArray<Block>,
      parentId: BlockId | null,
    ): { parentId: BlockId | null; prevSiblingId: BlockId | null; nextSiblingId: BlockId | null } | null {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        if (b.id === id) {
          return {
            parentId,
            prevSiblingId: i > 0 ? blocks[i - 1].id : null,
            nextSiblingId: i < blocks.length - 1 ? blocks[i + 1].id : null,
          }
        }
        const found = walk(b.children, b.id)
        if (found) return found
      }
      return null
    }
    const result = walk(state.blocks, null)
    if (!result) throw new Error(`Block not found: ${id}`)
    return result
  }

  private _prevSiblingOf(id: BlockId, state = this._state): BlockId | null {
    return this._treeInfo(id, state).prevSiblingId
  }

  private _parentOf(id: BlockId, state = this._state): BlockId | null {
    return this._treeInfo(id, state).parentId
  }

  private _nextTreeSiblingOf(id: BlockId, state = this._state): BlockId | null {
    return this._treeInfo(id, state).nextSiblingId
  }

  private _flatIds(state = this._state): BlockId[] {
    function walk(blocks: ReadonlyArray<Block>): BlockId[] {
      return blocks.flatMap(b => [b.id, ...walk(b.children)])
    }
    return walk(state.blocks)
  }

  private _emitBlockMovedForChanges(oldState: Blocks, excludeId?: BlockId): void {
    for (const id of this._flatIds()) {
      if (id === excludeId) continue
      const prevChanged   = this._prevSiblingOf(id) !== this._prevSiblingOf(id, oldState)
      const parentChanged = this._parentOf(id)      !== this._parentOf(id, oldState)
      if (prevChanged || parentChanged) {
        this._emit('blockMoved', {
          id,
          previousBlockId: this._prevSiblingOf(id),
          parentBlockId:   this._parentOf(id),
        })
      }
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _render(selection?: BlockSelection): void {
    const focused = document.activeElement === this._editable

    let savedSel: BlockSelection | undefined = selection
    if (savedSel === undefined && focused) {
      savedSel = this._getSelection() ?? undefined
    }

    this._editable.innerHTML = ''
    const nodes = blocksSerializer.render(this._state)
    for (const node of nodes) {
      this._editable.appendChild(node)
    }

    // Restore when selection was explicitly passed, or when we saved it because we were focused
    if (savedSel !== undefined) {
      try {
        this._restoreSelection(savedSel)
      } catch {
        // best-effort
      }
    }
  }

  private _restoreSelection(sel: BlockSelection): void {
    const domSel = window.getSelection()
    if (!domSel) return

    const range = document.createRange()

    if (sel instanceof BlockOffset) {
      const blockEl = this._editable.querySelector(`[id="${sel.blockId}"]`)
      if (!blockEl) return
      const p = getBlockElementContent(blockEl)
      const { node, offset } = findNodeAtOffset(p, sel.offset)
      range.setStart(node, offset)
      range.setEnd(node, offset)
    } else {
      const startBlockEl = this._editable.querySelector(`[id="${sel.start.blockId}"]`)
      const endBlockEl = this._editable.querySelector(`[id="${sel.end.blockId}"]`)
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

  private _getSelection(): BlockSelection | null {
    const domSel = window.getSelection()
    if (!domSel || domSel.rangeCount === 0) return null

    const range = domSel.getRangeAt(0)
    if (!this._editable.contains(range.startContainer)) return null
    if (!this._editable.contains(range.endContainer)) return null

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

  private _handleKeyDown(e: KeyboardEvent): void {
    if (this._composing) return

    const sel = this._getSelection()

    if (e.key === 'Enter') {
      e.preventDefault()
      if (sel) this._handleEnter(sel)
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
        this._handleBackspace(sel)
        return
      }
      if (sel instanceof BlockOffset && sel.offset === 0) {
        e.preventDefault()
        this._handleBackspace(sel)
        return
      }
      return
    }

    if (e.key === 'Delete') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        this._handleDelete(sel)
        return
      }
      if (sel instanceof BlockOffset) {
        const block = this._state.getBlock(sel.blockId)
        if (sel.offset === block.getLength()) {
          e.preventDefault()
          this._handleDelete(sel)
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
      const cursor = this._deleteRange(sel)
      const block = this._state.getBlock(cursor.blockId)
      const text = new Text(block.data.text, [...block.data.inline] as InlineDto[])
      const newText = insertChar(text, cursor.offset, e.key)
      this._state = this._state.update(cursor.blockId, newText)
      const newCursor = new BlockOffset(cursor.blockId, cursor.offset + 1)
      this._render(newCursor)
      this._scheduleDataUpdated(cursor.blockId)
      return
    }
  }

  private _handleInput(): void {
    if (this._composing) return

    const sel = this._getSelection()
    if (sel instanceof BlockRange) {
      throw new Error('BlockEditor invariant violated: multi-block selection during input')
    }
    if (!sel) return

    const { blockId } = sel
    const blockEl = this._editable.querySelector(`[id="${blockId}"]`)
    if (!blockEl) return

    const pEl = getBlockElementContent(blockEl)
    const newText = textSerializer.parse(Array.from(pEl.childNodes))
    this._state = this._state.update(blockId, newText)
    this._render(sel)
    this._scheduleDataUpdated(blockId)
  }

  private _handleEnter(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this._deleteRange(sel)
      this._render(cursor)
      return
    }
    // BlockOffset: split
    const { blockId, offset } = sel
    const block = this._state.getBlock(blockId)
    const atEnd = offset === block.getLength()

    if (atEnd) {
      this._flushDataUpdated(blockId)
    } else {
      this._cancelDataUpdated(blockId)
    }

    const oldState = this._state
    const newId = crypto.randomUUID()
    this._state = this._state.splitAt(blockId, offset, newId)
    this._render(new BlockOffset(newId, 0))

    if (!atEnd) {
      this._emit('blockDataUpdated', { id: blockId, data: this._state.getBlock(blockId).data })
    }

    this._emit('blockCreated', {
      id:              newId,
      data:            this._state.getBlock(newId).data,
      previousBlockId: this._prevSiblingOf(newId),
      parentBlockId:   this._parentOf(newId),
    })

    this._emitBlockMovedForChanges(oldState, newId)
  }

  private _handleBackspace(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this._deleteRange(sel)
      this._render(cursor)
      return
    }
    // BlockOffset at offset 0
    const { blockId } = sel
    const prevId = this._state.previousBlockId(blockId)
    if (prevId === null) return  // first block — no-op
    const cursorOffset = this._state.getBlock(prevId).getLength()
    this._cancelDataUpdated(blockId)
    this._cancelDataUpdated(prevId)
    this._state = this._state.merge(prevId, blockId)
    this._render(new BlockOffset(prevId, cursorOffset))
    this._emit('blockDataUpdated', { id: prevId, data: this._state.getBlock(prevId).data })
    this._emit('blockRemoved', { id: blockId })
  }

  private _handleDelete(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this._deleteRange(sel)
      this._render(cursor)
      return
    }
    // BlockOffset at end of block
    const { blockId } = sel
    const nextId = this._state.nextBlockId(blockId)
    if (nextId === null) return  // last block — no-op
    const cursorOffset = this._state.getBlock(blockId).getLength()
    this._cancelDataUpdated(nextId)
    this._cancelDataUpdated(blockId)
    this._state = this._state.merge(blockId, nextId)
    this._render(new BlockOffset(blockId, cursorOffset))
    this._emit('blockDataUpdated', { id: blockId, data: this._state.getBlock(blockId).data })
    this._emit('blockRemoved', { id: nextId })
  }

  private _deleteRange(sel: BlockRange): BlockOffset {
    if (sel.start.blockId === sel.end.blockId) {
      const block = this._state.getBlock(sel.start.blockId)
      const text = new Text(block.data.text, [...block.data.inline] as InlineDto[])
      const length = sel.end.offset - sel.start.offset
      const newText = text.remove(sel.start.offset, length)
      this._cancelDataUpdated(sel.start.blockId)
      this._state = this._state.update(sel.start.blockId, newText)
      this._emit('blockDataUpdated', { id: sel.start.blockId, data: this._state.getBlock(sel.start.blockId).data })
      return new BlockOffset(sel.start.blockId, sel.start.offset)
    }
    // Multi-block
    const oldIds = new Set(this._flatIds())
    this._cancelAllDataUpdates()
    this._state = this._state.deleteRange(sel)
    const newIds = new Set(this._flatIds())
    this._emit('blockDataUpdated', { id: sel.start.blockId, data: this._state.getBlock(sel.start.blockId).data })
    for (const id of oldIds) {
      if (!newIds.has(id)) this._emit('blockRemoved', { id })
    }
    return new BlockOffset(sel.start.blockId, sel.start.offset)
  }
}
