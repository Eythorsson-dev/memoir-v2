import { textSerializer } from '../text/serializer'
import { Blocks, BlockOffset, BlockRange, BlockDataChanged, type HeaderLevel } from '../blocks/blocks'
import type { BlockSelection } from './events'
import type { BlockRenderer } from './BlockRenderer'
import { getBlockElementContent } from './BlockRenderer'
import type { BlockHistory } from './BlockHistory'
import type { BlockEventEmitter } from './BlockEventEmitter'
import { InputRules } from './InputRules'

// ─── InputHandler ───────────────────────────────────────────────────────────

/**
 * Owns keydown, beforeinput, and input event logic for a block editor
 *
 * @remarks
 * Extracted from `BlockEditor` to enable composition by `DailyNoteEditor`.
 * Reads and writes `Blocks` state through getter/setter callbacks so the
 * owning editor retains ownership of the state reference.
 */
export class InputHandler {
  #renderer: BlockRenderer
  #getState: () => Blocks
  #setState: (blocks: Blocks) => void
  #history: BlockHistory
  #emitter: BlockEventEmitter
  #pendingSelectionBefore: BlockSelection | null = null

  /**
   * IME composition guard.
   * Set true on compositionstart, false on compositionend.
   * handleInput is a no-op while composing, then fires once on compositionend.
   */
  #composing = false

  constructor(
    renderer: BlockRenderer,
    getState: () => Blocks,
    setState: (blocks: Blocks) => void,
    history: BlockHistory,
    emitter: BlockEventEmitter,
  ) {
    this.#renderer = renderer
    this.#getState = getState
    this.#setState = setState
    this.#history = history
    this.#emitter = emitter
  }

  /** Whether an IME composition is in progress. */
  get composing(): boolean {
    return this.#composing
  }

  set composing(value: boolean) {
    this.#composing = value
  }

  get pendingSelectionBefore(): BlockSelection | null {
    return this.#pendingSelectionBefore
  }

  set pendingSelectionBefore(value: BlockSelection | null) {
    this.#pendingSelectionBefore = value
  }

  // ─── Public mutation methods ──────────────────────────────────────────────

  handleEnter(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this.deleteRange(sel)
      this.#renderer.render(this.#getState(), cursor)
      return
    }

    const { blockId, offset } = sel
    const state = this.#getState()
    const block = state.getBlock(blockId)
    const atEnd = offset === block.getLength()

    if (atEnd) {
      this.#emitter.flushDataUpdated(blockId)
    }

    const oldState = state
    const newId = crypto.randomUUID()
    let newState = state.splitAt(blockId, offset, newId)

    // Enter at the end of a header produces a plain text block
    if (block.blockType === 'header' && atEnd) {
      newState = newState.convertType(newId, newId, 'text')
    }

    this.#setState(newState)
    this.#renderer.render(newState, new BlockOffset(newId, 0))
    this.#emitEvents(oldState)
  }

  handleBackspace(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this.deleteRange(sel)
      this.#renderer.render(this.#getState(), cursor)
      return
    }

    const { blockId } = sel
    const state = this.#getState()
    const prevId = state.previousBlockId(blockId)
    if (prevId === null) return

    const cursorOffset = state.getBlock(prevId).getLength()
    const oldState = state
    const newState = state.merge(prevId, blockId)
    this.#setState(newState)
    this.#renderer.render(newState, new BlockOffset(prevId, cursorOffset))
    this.#emitEvents(oldState)
  }

  handleDelete(sel: BlockSelection): void {
    if (sel instanceof BlockRange) {
      const cursor = this.deleteRange(sel)
      this.#renderer.render(this.#getState(), cursor)
      return
    }

    const { blockId } = sel
    const state = this.#getState()
    const nextId = state.nextBlockId(blockId)
    if (nextId === null) return

    const cursorOffset = state.getBlock(blockId).getLength()
    const oldState = state
    const newState = state.merge(blockId, nextId)
    this.#setState(newState)
    this.#renderer.render(newState, new BlockOffset(blockId, cursorOffset))
    this.#emitEvents(oldState)
  }

  deleteRange(sel: BlockRange): BlockOffset {
    const state = this.#getState()
    if (sel.start.blockId === sel.end.blockId) {
      const block = state.getBlock(sel.start.blockId)
      const text = block.getText()
      const length = sel.end.offset - sel.start.offset
      const newText = text.remove(sel.start.offset, length)
      const oldState = state
      const newState = state.update(sel.start.blockId, newText)
      this.#setState(newState)
      this.#emitEvents(oldState)
      return new BlockOffset(sel.start.blockId, sel.start.offset)
    }

    const oldState = state
    const newState = state.deleteRange(sel)
    this.#setState(newState)
    this.#emitEvents(oldState)
    return new BlockOffset(sel.start.blockId, sel.start.offset)
  }

  /**
   * Delete a range selection and insert a single character at the cursor
   *
   * @remarks
   * Used when a printable character is typed while a range is selected.
   */
  insertCharOverRange(sel: BlockRange, char: string): void {
    const cursor = this.deleteRange(sel)
    const state = this.#getState()
    const block = state.getBlock(cursor.blockId)
    const text = block.getText()
    const newText = text.insert(cursor.offset, char)
    const newCursor = new BlockOffset(cursor.blockId, cursor.offset + 1)
    const newState = state.update(cursor.blockId, newText)
    this.#setState(newState)
    this.#renderer.render(newState, newCursor)
    this.#emitter.scheduleDataUpdated(cursor.blockId)
  }

  /**
   * Handle contenteditable input event (character typing, IME completion)
   *
   * @remarks
   * Reads the DOM to determine what the user typed, updates state,
   * and checks for input rule matches (markdown shortcuts).
   */
  handleInput(): void {
    if (this.#composing) return

    const sel = this.#renderer.getSelection()
    if (sel instanceof BlockRange) {
      throw new Error('BlockEditor invariant violated: multi-block selection during input')
    }
    if (!sel) return

    const { blockId } = sel
    const editable = this.#renderer.editable
    const blockEl = editable.querySelector(`[id="${blockId}"]`)
    if (!blockEl) return

    const pEl = getBlockElementContent(blockEl)
    const newText = textSerializer.parse(Array.from(pEl.childNodes))
    const state = this.#getState()
    const oldState = state
    let newState = state.update(blockId, newText)
    this.#setState(newState)
    const currentType = newState.getBlock(blockId).blockType

    const match = InputRules.match(newText.text, sel.offset, currentType)
    if (match) {
      this.#history.updateOrAdd(
        blockId,
        new BlockDataChanged(blockId, 'text', newText),
        this.#pendingSelectionBefore,
        sel,
      )

      const strippedText = newText.remove(0, match.stripLength)
      newState = newState.update(blockId, strippedText)
      if (match.targetType === 'header') {
        newState = newState.convertToHeader(blockId, blockId, (match as { headerLevel: HeaderLevel }).headerLevel)
      } else {
        newState = newState.convertType(blockId, blockId, match.targetType)
      }
      this.#setState(newState)

      const cursorAfter = new BlockOffset(blockId, 0)
      const changes = Blocks.diff(oldState, newState)
      this.#history.add(changes, sel, cursorAfter)
      this.#pendingSelectionBefore = null
      this.#renderer.render(newState, cursorAfter)
      this.#emitter.scheduleDataUpdated(blockId)
      return
    }

    this.#history.updateOrAdd(blockId, new BlockDataChanged(blockId, currentType, newText), this.#pendingSelectionBefore, sel)
    this.#pendingSelectionBefore = null
    this.#renderer.render(newState, sel)
    this.#emitter.scheduleDataUpdated(blockId)
  }

  #emitEvents(oldState: Blocks): void {
    const newState = this.#getState()
    const changes = Blocks.diff(oldState, newState)
    if (changes.length > 0) {
      const selAfter = this.#renderer.getSelection()
      this.#history.add(changes, this.#pendingSelectionBefore, selAfter)
    }
    this.#pendingSelectionBefore = null
    this.#emitter.dispatchChanges(changes)
  }
}
