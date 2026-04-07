import { Blocks, type BlockId, BlockDataChanged, type BlocksChange } from '../blocks/blocks'
import type { BlockSelection } from './events'

interface Entry {
  changes:         BlocksChange[]
  selectionBefore: BlockSelection | null
  selectionAfter:  BlockSelection | null
}

export class BlockHistory {
  static readonly MAX_DEPTH = 100

  #base: Blocks
  #transactions: Entry[] = []
  #pointer = 0

  constructor(base: Blocks) {
    this.#base = base
  }

  /**
   * Reset the history to a new base state, discarding all recorded transactions.
   *
   * @remarks
   * Call this when the note content is replaced externally (e.g. after an
   * async load from the provider) so that subsequent undo steps replay events
   * against the correct base block IDs.
   *
   * @param base - The new base state to use as the undo floor.
   */
  reset(base: Blocks): void {
    this.#base = base
    this.#transactions = []
    this.#pointer = 0
  }

  canUndo(): boolean {
    return this.#pointer > 0
  }

  canRedo(): boolean {
    return this.#pointer < this.#transactions.length
  }

  undo(): { blocks: Blocks; selection: BlockSelection | null } {
    if (!this.canUndo()) throw new Error('Nothing to undo')
    const entry = this.#transactions[this.#pointer - 1]
    this.#pointer--
    return { blocks: Blocks.fromEvents(this.#base, this.events), selection: entry.selectionBefore }
  }

  redo(): { blocks: Blocks; selection: BlockSelection | null } {
    if (!this.canRedo()) throw new Error('Nothing to redo')
    const entry = this.#transactions[this.#pointer]
    this.#pointer++
    return { blocks: Blocks.fromEvents(this.#base, this.events), selection: entry.selectionAfter }
  }

  add(changes: BlocksChange[], selectionBefore: BlockSelection | null, selectionAfter: BlockSelection | null): void {
    // Clear redo stack
    this.#transactions.splice(this.#pointer)
    this.#transactions.push({ changes, selectionBefore, selectionAfter })
    this.#pointer++
    // Cap at MAX_DEPTH
    if (this.#transactions.length > BlockHistory.MAX_DEPTH) {
      this.#transactions.shift()
      this.#pointer--
    }
  }

  get events(): readonly BlocksChange[] {
    return this.#transactions.slice(0, this.#pointer).flatMap(e => e.changes)
  }

  /**
   * If the last transaction is a single `BlockDataChanged` for `blockId`,
   * replace it in-place (text edit coalescing). Otherwise add a new transaction.
   *
   * When coalescing: preserves the original `selectionBefore` (burst-start caret)
   * and updates `selectionAfter` to the latest position.
   */
  updateOrAdd(blockId: BlockId, change: BlockDataChanged, selectionBefore: BlockSelection | null, selectionAfter: BlockSelection | null): void {
    const lastTx = this.#pointer > 0 ? this.#transactions[this.#pointer - 1] : null
    if (
      lastTx !== null &&
      lastTx.changes.length === 1 &&
      lastTx.changes[0] instanceof BlockDataChanged &&
      lastTx.changes[0].id === blockId
    ) {
      // Coalesce: preserve original selectionBefore, update selectionAfter
      this.#transactions[this.#pointer - 1] = {
        changes: [change],
        selectionBefore: lastTx.selectionBefore,
        selectionAfter,
      }
    } else {
      this.add([change], selectionBefore, selectionAfter)
    }
  }
}
