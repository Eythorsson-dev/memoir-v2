import { Blocks, BlockOffset, BlockRange, type BlockId, type BlocksChange } from '../blocks/blocks'
import type { BlockSelection } from './events'
import { BlockRenderer } from './BlockRenderer'
import { BlockHistory } from './BlockHistory'
import { BlockEventEmitter } from './BlockEventEmitter'
import { InputHandler } from './InputHandler'

const DATA_EVENTS = ['blockCreated', 'blockDataUpdated', 'blockRemoved', 'blockMoved'] as const

/**
 * Encapsulates per-day state for a section within `DailyNoteScrollView`.
 *
 * @remarks
 * Accepts a `contentEl` already created by the scroll view and internally
 * wires `BlockHistory`, `BlockEventEmitter`, `BlockRenderer`, and
 * `InputHandler`. Extracting this removes the repetitive per-section wiring
 * from `DailyNoteScrollView#mountSection` without touching the shared
 * contenteditable model.
 *
 * `BlockHistory` is kept internally only to satisfy `InputHandler`'s
 * interface; undo/redo is owned by `DailyNoteHistory` at the scroll-view
 * level and never calls `history.undo()` / `history.redo()` here.
 */
export class DaySection {
  readonly date: string

  #blocks: Blocks
  #history: BlockHistory
  #emitter: BlockEventEmitter
  #renderer: BlockRenderer
  #input: InputHandler

  constructor(
    contentEl: HTMLElement,
    date: string,
    opts: { debounceMs: number; maxWaitMs: number },
  ) {
    this.date = date

    const initialBlocks = Blocks.from([Blocks.createTextBlock()])
    this.#blocks = initialBlocks
    this.#history = new BlockHistory(initialBlocks)
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
   * Used by undo/redo and cross-day operations in `DailyNoteScrollView`
   * where the caller handles rendering and event dispatch separately.
   */
  set blocks(value: Blocks) {
    this.#blocks = value
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
