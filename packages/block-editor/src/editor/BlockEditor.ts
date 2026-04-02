import { type InlineTypes, type InlineDtoMap, type InlineDto } from '../text/text'
import { Blocks, type BlockId, type BlockTypes, type BlocksChange, type HeaderLevel, BlockOffset, BlockRange, BlockDataChanged, BlockAdded, BlockRemoved, BlockMoved } from '../blocks/blocks'
import type { BlockEditorEventDtoMap, BlockEditorOptions, BlockSelection } from './events'
import { BlockEventEmitter } from './BlockEventEmitter'
import { BlockHistory } from './BlockHistory'
import { BlockRenderer } from './BlockRenderer'
import { InputHandler } from './InputHandler'
import './block-editor.css'

export { BlockOffset, BlockRange } from '../blocks/blocks'
export type { BlockSelection } from './events'

// ─── Inline toggle helpers ────────────────────────────────────────────────────

/**
 * Inline types whose payload is `never` — no extra data beyond type/start/end.
 */
type NeverPayloadTypes = { [K in InlineTypes]: InlineDtoMap[K] extends never ? K : never }[InlineTypes]

/**
 * Inline types that carry a payload.
 */
type DataPayloadTypes = Exclude<InlineTypes, NeverPayloadTypes>

// ─── BlockEditor ─────────────────────────────────────────────────────────────

export class BlockEditor {
  #state: Blocks
  #history: BlockHistory
  #emitter: BlockEventEmitter
  #renderer: BlockRenderer
  #input: InputHandler

  #onSelectionChange = (): void => {
    if (document.activeElement === this.#renderer.editable) {
      this.#emitter.emit('selectionChange', this.#renderer.getSelection())
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
          return { id, blockType: block.blockType, data: block.data }
        } catch (err) {
          if (err instanceof Error) return null  // block was removed; skip
          throw err
        }
      },
      {
        debounceMs: opts.dataUpdateDebounceMs ?? 1000,
        maxWaitMs:  opts.dataUpdateMaxWaitMs  ?? 10000,
      },
    )

    const editable = document.createElement('div')
    editable.className = 'block-editor-editable'
    editable.contentEditable = 'true'

    this.#renderer = new BlockRenderer(editable)
    this.#input = new InputHandler(
      this.#renderer,
      () => this.#state,
      (s) => { this.#state = s },
      this.#history,
      this.#emitter,
    )

    editable.addEventListener('keydown', (e) => this.#handleKeyDown(e))
    editable.addEventListener('input', () => this.#input.handleInput())
    editable.addEventListener('blur', this.#onBlur)
    editable.addEventListener('compositionstart', () => {
      const sel = this.#renderer.getSelection()
      this.#input.pendingSelectionBefore = sel
      if (sel instanceof BlockRange) {
        const cursor = this.#input.deleteRange(sel)
        this.#renderer.render(this.#state, cursor)
      }
      this.#input.composing = true
    })
    editable.addEventListener('compositionend', () => {
      this.#input.composing = false
      this.#input.handleInput()
    })

    document.addEventListener('selectionchange', this.#onSelectionChange)

    container.appendChild(editable)
    this.#renderer.render(this.#state)
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getValue(): Blocks {
    return this.#state
  }

  setValue(blocks: Blocks): void {
    this.#emitter.cancelAll()
    this.#state = blocks
    this.#renderer.render(this.#state)
    // no events
  }

  /** Registers a typed event listener. Returns an unsubscribe function. */
  addEventListener<K extends keyof BlockEditorEventDtoMap>(
    event: K,
    handler: (payload: BlockEditorEventDtoMap[K]) => void,
  ): () => void {
    return this.#emitter.addEventListener(event, handler)
  }

  /**
   * Resolves the current selection to a `[fromId, toId]` pair.
   * Returns `null` when there is no selection.
   */
  #getSelectionBlockIds(): { sel: BlockSelection; fromId: BlockId; toId: BlockId } | null {
    const sel = this.#renderer.getSelection()
    if (!sel) return null
    const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
    const toId   = sel instanceof BlockRange ? sel.end.blockId   : sel.blockId
    return { sel, fromId, toId }
  }

  /** Indent current block range; re-render preserving full BlockSelection. */
  indent(): void {
    const r = this.#getSelectionBlockIds()
    if (!r) return
    this.#input.pendingSelectionBefore = r.sel
    const oldState = this.#state
    this.#state = this.#state.indent(r.fromId, r.toId)
    this.#renderer.render(this.#state, r.sel)
    this.#emitEvents(oldState)
  }

  /** Unindent current block range; re-render preserving full BlockSelection. */
  outdent(): void {
    const r = this.#getSelectionBlockIds()
    if (!r) return
    this.#input.pendingSelectionBefore = r.sel
    const oldState = this.#state
    this.#state = this.#state.unindent(r.fromId, r.toId)
    this.#renderer.render(this.#state, r.sel)
    this.#emitEvents(oldState)
  }

  /** Converts all blocks in the current selection to `newType`. */
  convertBlockType(newType: Exclude<BlockTypes, 'header'>): void {
    const r = this.#getSelectionBlockIds()
    if (!r) return
    this.#input.pendingSelectionBefore = r.sel
    const oldState = this.#state
    this.#state = this.#state.convertType(r.fromId, r.toId, newType)
    this.#renderer.render(this.#state, r.sel)
    this.#emitEvents(oldState)
  }

  /**
   * Converts all blocks in the current selection to a header at `level`.
   * If every block in the selection is already a header at `level`, demotes
   * them to plain text instead (toggle behaviour).
   */
  convertToHeader(level: HeaderLevel): void {
    const r = this.#getSelectionBlockIds()
    if (!r) return
    this.#input.pendingSelectionBefore = r.sel
    const oldState = this.#state
    if (this.#state.getCommonHeaderLevel(r.fromId, r.toId) === level) {
      this.#state = this.#state.convertType(r.fromId, r.toId, 'text')
    } else {
      this.#state = this.#state.convertToHeader(r.fromId, r.toId, level)
    }
    this.#renderer.render(this.#state, r.sel)
    this.#emitEvents(oldState)
  }

  /**
   * Returns the common header level of the current selection, or `null` if
   * the selection is empty, not a header, or contains mixed levels.
   *
   * @remarks
   * Returns `null` when the selection references a block that no longer
   * exists (stale selection during DOM reconciliation).
   */
  getActiveHeaderLevel(): HeaderLevel | null {
    const r = this.#getSelectionBlockIds()
    if (!r) return null
    try {
      return this.#state.getCommonHeaderLevel(r.fromId, r.toId)
    } catch (err) {
      if (err instanceof Error) return null  // stale selection
      throw err
    }
  }

  /**
   * Returns true only when every block in the current selection is `type`.
   * Returns false for no selection or a mixed selection.
   *
   * @remarks
   * Returns `false` when the selection references a block that no longer
   * exists (stale selection during DOM reconciliation).
   */
  isBlockTypeActive(type: BlockTypes): boolean {
    const r = this.#getSelectionBlockIds()
    if (!r) return false
    try {
      return this.#state.isBlockTypeActive(r.fromId, r.toId, type)
    } catch (err) {
      if (err instanceof Error) return false  // stale selection
      throw err
    }
  }

  /**
   * Toggles an inline format on the current selection.
   *
   * For never-payload types (Bold, Italic, Underline): call with type only.
   * For payload types (Highlight): call with type and payload.
   *
   * Toggle logic: if the entire selection is already covered by the exact
   * type+payload, the inline is removed. Otherwise it is applied (exclusive
   * types clear any existing same-type inlines first).
   */
  toggleInline(type: NeverPayloadTypes): void
  toggleInline<K extends DataPayloadTypes>(type: K, payload: InlineDtoMap[K]): void
  toggleInline(type: InlineTypes, payload?: InlineDtoMap[DataPayloadTypes]): void {
    const sel = this.#renderer.getSelection()
    if (!(sel instanceof BlockRange)) return
    const oldState = this.#state
    this.#state = payload !== undefined
      ? this.#state.toggleInline(sel, type as DataPayloadTypes, payload)
      : this.#state.toggleInline(sel, type as NeverPayloadTypes)
    this.#renderer.render(this.#state, sel)
    this.#emitEvents(oldState)
  }

  /**
   * Removes all inlines of the given type from the current selection,
   * regardless of payload.
   */
  removeInlineFromSelection(type: InlineTypes): void {
    const sel = this.#renderer.getSelection()
    if (!(sel instanceof BlockRange)) return
    const oldState = this.#state
    this.#state = this.#state.removeInlineFromRange(sel, type)
    this.#renderer.render(this.#state, sel)
    this.#emitEvents(oldState)
  }

  /**
   * Returns true if any inline of `type` (regardless of payload) fully covers
   * the current selection. Used for toolbar active-state indicators.
   */
  isInlineActive(type: InlineTypes): boolean {
    const sel = this.#renderer.getSelection()
    if (!(sel instanceof BlockRange)) return false
    try {
      return this.#state.isInlineActive(sel, type)
    } catch (err) {
      if (err instanceof Error) return false  // stale selection
      throw err
    }
  }

  /**
   * Returns the single inline of `type` that covers the entire current
   * selection, or `null` if no such inline exists or if multiple different
   * inlines partially cover the selection.
   *
   * Used by the highlight picker to show which swatch is currently active.
   */
  getActiveInline<K extends InlineTypes>(type: K): InlineDto<K> | null {
    const sel = this.#renderer.getSelection()
    if (!(sel instanceof BlockRange)) return null
    try {
      return this.#state.getActiveInline(sel, type)
    } catch (err) {
      if (err instanceof Error) return null  // stale selection
      throw err
    }
  }

  canUndo(): boolean { return this.#history.canUndo() }
  canRedo(): boolean { return this.#history.canRedo() }

  undo(): void {
    if (!this.#history.canUndo()) return
    const oldState = this.#state
    const { blocks, selection } = this.#history.undo()
    this.#state = blocks
    this.#renderer.render(this.#state, selection ?? undefined)
    this.#dispatchChanges(Blocks.diff(oldState, this.#state))
  }

  redo(): void {
    if (!this.#history.canRedo()) return
    const oldState = this.#state
    const { blocks, selection } = this.#history.redo()
    this.#state = blocks
    this.#renderer.render(this.#state, selection ?? undefined)
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
    this.#renderer.editable.remove()
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  #dispatchChanges(changes: BlocksChange[]): void {
    this.#emitter.cancelAll()

    const dataChanged: BlockDataChanged[] = []
    const added: BlockAdded[] = []
    const removed: BlockRemoved[] = []
    const moved: BlockMoved[] = []

    for (const change of changes) {
      if (change instanceof BlockDataChanged) {
        dataChanged.push(change)
      } else if (change instanceof BlockAdded) {
        added.push(change)
      } else if (change instanceof BlockRemoved) {
        removed.push(change)
      } else if (change instanceof BlockMoved) {
        moved.push(change)
      } else {
        const _exhaustive: never = change
        throw new Error(`Unhandled BlocksChange: ${(_exhaustive as { constructor: { name: string } }).constructor.name}`)
      }
    }

    for (const c of dataChanged) this.#emitter.emit('blockDataUpdated', { id: c.id, blockType: c.blockType, data: c.data })
    for (const c of added) this.#emitter.emit('blockCreated', { id: c.id, blockType: c.blockType, data: c.data, previousBlockId: c.previousBlockId, parentBlockId: c.parentBlockId })
    for (const c of removed) this.#emitter.emit('blockRemoved', { id: c.id })
    for (const c of moved) this.#emitter.emit('blockMoved', { id: c.id, previousBlockId: c.previousBlockId, parentBlockId: c.parentBlockId })
  }

  #emitEvents(oldState: Blocks): void {
    const changes = Blocks.diff(oldState, this.#state)
    if (changes.length > 0) {
      const selAfter = this.#renderer.getSelection()
      this.#history.add(changes, this.#input.pendingSelectionBefore, selAfter)
    }
    this.#input.pendingSelectionBefore = null
    this.#dispatchChanges(changes)
  }

  // ─── Private: keydown routing ─────────────────────────────────────────────

  #handleKeyDown(e: KeyboardEvent): void {
    if (this.#input.composing) return

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

    const sel = this.#renderer.getSelection()
    this.#input.pendingSelectionBefore = sel

    if (e.key === 'Enter') {
      e.preventDefault()
      if (sel) this.#input.handleEnter(sel)
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
        this.#input.handleBackspace(sel)
        return
      }
      if (sel instanceof BlockOffset && sel.offset === 0) {
        e.preventDefault()
        this.#input.handleBackspace(sel)
        return
      }
      return
    }

    if (e.key === 'Delete') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        this.#input.handleDelete(sel)
        return
      }
      if (sel instanceof BlockOffset) {
        const block = this.#state.getBlock(sel.blockId)
        if (sel.offset === block.getLength()) {
          e.preventDefault()
          this.#input.handleDelete(sel)
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
      this.#input.insertCharOverRange(sel, e.key)
      return
    }
  }
}
