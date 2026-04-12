import { Blocks, BlockOffset, BlockRange, type BlockId, type BlocksChange } from '../blocks/blocks'
import type { BlockSelection } from './events'
import { BlockRenderer } from './BlockRenderer'
import type { ISectionHistory } from './EditorHistory'
import { BlockEventEmitter } from './BlockEventEmitter'
import { InputHandler } from './InputHandler'

const DATA_EVENTS = ['blockCreated', 'blockDataUpdated', 'blockRemoved', 'blockMoved'] as const

/**
 * Encapsulates per-day state for a section within `DailyNoteScrollView`.
 *
 * @remarks
 * Accepts a `contentEl` already created by the scroll view and internally
 * wires `ISectionHistory`, `BlockEventEmitter`, `BlockRenderer`, and
 * `InputHandler`. The `history` handle is obtained from a shared
 * `EditorHistory` instance via `EditorHistory.forSection` and passed in via
 * `opts`; undo/redo is owned at the scroll-view level.
 */
export class DaySection {
  readonly date: string

  #blocks: Blocks
  #history: ISectionHistory
  #emitter: BlockEventEmitter
  #renderer: BlockRenderer
  #input: InputHandler

  constructor(
    contentEl: HTMLElement,
    date: string,
    opts: { debounceMs: number; maxWaitMs: number; history: ISectionHistory },
  ) {
    this.date = date

    const initialBlocks = Blocks.from([Blocks.createTextBlock()])
    this.#blocks = initialBlocks
    this.#history = opts.history
    this.#emitter = new BlockEventEmitter(
      (id: BlockId) => {
        try {
          const block = this.#blocks.getBlock(id)
          return { id, blockType: block.blockType, data: block.data }
        } catch {
          return null
        }
      },
      opts,
    )
    this.#renderer = new BlockRenderer(contentEl)
    this.#input = new InputHandler(
      this.#renderer,
      () => this.#blocks,
      (b) => { this.#blocks = b },
      this.#history,
      this.#emitter,
    )

    this.#renderer.render(this.#blocks)
  }

  // ─── State ──────────────────────────────────────────────────────────────────

  get blocks(): Blocks {
    return this.#blocks
  }

  /**
   * Replace the current blocks without rendering or resetting history.
   *
   * @remarks
   * Used by cross-day operations in `DailyNoteScrollView` where the caller
   * handles rendering and event dispatch separately.
   */
  set blocks(value: Blocks) {
    this.#blocks = value
  }

  /**
   * Apply new blocks, re-render, and dispatch change events.
   *
   * @remarks
   * Called by `EditorHistory` `applyFn` callbacks on undo/redo. Sets state,
   * renders, and fires `dispatchChanges` so auto-save listeners are notified.
   *
   * @param blocks - The new block state to apply.
   * @param selection - Optional cursor/selection to restore.
   */
  applyBlocks(blocks: Blocks, selection?: BlockSelection): void {
    const old = this.#blocks
    this.#blocks = blocks
    this.#renderer.render(blocks, selection)
    this.#emitter.dispatchChanges(Blocks.diff(old, blocks))
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Replace blocks, reset history, and re-render.
   *
   * @remarks
   * Called after an async provider load completes. Resetting history ensures
   * subsequent undo steps replay against the loaded block IDs, not the empty
   * placeholder created before the async load.
   */
  load(blocks: Blocks): void {
    this.#blocks = blocks
    this.#history.reset(blocks)
    this.#renderer.render(blocks)
  }

  /** Immediately flush all pending debounced events. Called on blur. */
  flushAll(): void {
    this.#emitter.flushAll()
  }

  /** Flush pending events synchronously, then cancel all timers. */
  destroy(): void {
    this.#emitter.flushAll()
    this.#emitter.cancelAll()
  }

  // ─── Input (delegated to InputHandler) ──────────────────────────────────────

  /** Whether an IME composition is in progress. */
  get composing(): boolean {
    return this.#input.composing
  }

  set composing(value: boolean) {
    this.#input.composing = value
  }

  get pendingSelectionBefore(): BlockSelection | null {
    return this.#input.pendingSelectionBefore
  }

  set pendingSelectionBefore(value: BlockSelection | null) {
    this.#input.pendingSelectionBefore = value
  }

  handleInput(): void {
    this.#input.handleInput()
  }

  handleEnter(sel: BlockSelection): void {
    this.#input.handleEnter(sel)
  }

  handleBackspace(sel: BlockSelection): void {
    this.#input.handleBackspace(sel)
  }

  handleDelete(sel: BlockSelection): void {
    this.#input.handleDelete(sel)
  }

  insertCharOverRange(sel: BlockRange, char: string): void {
    this.#input.insertCharOverRange(sel, char)
  }

  deleteRange(range: BlockRange): BlockOffset {
    return this.#input.deleteRange(range)
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  getSelection(): BlockSelection | null {
    return this.#renderer.getSelection()
  }

  /** Render the current blocks into the content element with an optional cursor. */
  render(cursor?: BlockSelection): void {
    this.#renderer.render(this.#blocks, cursor)
  }

  // ─── Emitter ────────────────────────────────────────────────────────────────

  /**
   * Register a callback that fires whenever any data-change event is emitted.
   *
   * @remarks
   * Subscribes to all of `blockCreated`, `blockDataUpdated`, `blockRemoved`,
   * and `blockMoved`. Used to wire auto-save in `DailyNoteScrollView`.
   */
  onDataChange(handler: () => void): void {
    for (const event of DATA_EVENTS) {
      this.#emitter.addEventListener(event, handler)
    }
  }

  dispatchChanges(changes: BlocksChange[]): void {
    this.#emitter.dispatchChanges(changes)
  }

  scheduleDataUpdated(blockId: BlockId): void {
    this.#emitter.scheduleDataUpdated(blockId)
  }
}
