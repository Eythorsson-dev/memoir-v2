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
  /** Maximum time to defer the event — fires even during continuous rapid typing once this limit is reached. Default 10000. */
  dataUpdateMaxWaitMs?:  number  // default 10000
}

export const BLOCK_EDITOR_EVENT_NAMES = [
  'selectionChange', 'blockCreated', 'blockDataUpdated', 'blockRemoved', 'blockMoved',
] as const satisfies ReadonlyArray<keyof BlockEditorEventMap>

// Compile-time exhaustiveness checks: both directions must hold
type _AllIncluded = keyof BlockEditorEventMap extends (typeof BLOCK_EDITOR_EVENT_NAMES)[number] ? true : never
type _NoExtras    = (typeof BLOCK_EDITOR_EVENT_NAMES)[number] extends keyof BlockEditorEventMap ? true : never

// Re-export so consumers can do instanceof checks
export { BlockOffset, BlockRange }
