import { Blocks, type BlockId, BlockDataChanged, type BlocksChange } from '../blocks/blocks'

export class BlockHistory {
  static readonly MAX_DEPTH = 100

  #base: Blocks
  #transactions: BlocksChange[][] = []
  #pointer = 0

  constructor(base: Blocks) {
    this.#base = base
  }

  canUndo(): boolean {
    return this.#pointer > 0
  }

  canRedo(): boolean {
    return this.#pointer < this.#transactions.length
  }

  undo(): Blocks {
    if (!this.canUndo()) throw new Error('Nothing to undo')
    this.#pointer--
    return Blocks.fromEvents(this.#base, this.events)
  }

  redo(): Blocks {
    if (!this.canRedo()) throw new Error('Nothing to redo')
    this.#pointer++
    return Blocks.fromEvents(this.#base, this.events)
  }

  add(changes: BlocksChange[]): void {
    // Clear redo stack
    this.#transactions.splice(this.#pointer)
    this.#transactions.push(changes)
    this.#pointer++
    // Cap at MAX_DEPTH
    if (this.#transactions.length > BlockHistory.MAX_DEPTH) {
      this.#transactions.shift()
      this.#pointer--
    }
  }

  get events(): readonly BlocksChange[] {
    return this.#transactions.slice(0, this.#pointer).flat()
  }

  /**
   * If the last transaction is a single `BlockDataChanged` for `blockId`,
   * replace it in-place (text edit coalescing). Otherwise add a new transaction.
   */
  updateOrAdd(blockId: BlockId, change: BlockDataChanged): void {
    const lastTx = this.#pointer > 0 ? this.#transactions[this.#pointer - 1] : null
    if (
      lastTx !== null &&
      lastTx.length === 1 &&
      lastTx[0] instanceof BlockDataChanged &&
      lastTx[0].id === blockId
    ) {
      this.#transactions[this.#pointer - 1] = [change]
    } else {
      this.add([change])
    }
  }
}
