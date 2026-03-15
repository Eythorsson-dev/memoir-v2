import type { BlockId } from '../blocks/blocks'
import type { TextDto } from '../text/text'
import { BlockOffset, BlockRange } from '../blocks/blocks'

export type BlockSelection        = BlockOffset | BlockRange
export type BlockCreatedEvent     = { id: BlockId; data: TextDto; previousBlockId: BlockId | null; parentBlockId: BlockId | null }
export type BlockDataUpdatedEvent = { id: BlockId; data: TextDto }
export type BlockRemovedEvent     = { id: BlockId }
export type BlockMovedEvent       = { id: BlockId; previousBlockId: BlockId | null; parentBlockId: BlockId | null }

export type BlockEditorEventMap = {
  selectionChange:  BlockSelection | null
  blockCreated:     BlockCreatedEvent
  blockDataUpdated: BlockDataUpdatedEvent
  blockRemoved:     BlockRemovedEvent
  blockMoved:       BlockMovedEvent
}

export interface BlockEditorOptions {
  dataUpdateDebounceMs?: number  // default 1000
  dataUpdateMaxWaitMs?:  number  // default 10000
}

// Re-export so consumers can do instanceof checks
export { BlockOffset, BlockRange }
