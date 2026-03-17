import type { BlockId } from '../blocks/blocks'
import type { TextDto } from '../text/text'
import { BlockOffset, BlockRange } from '../blocks/blocks'

export type BlockSelection        = BlockOffset | BlockRange
export type BlockCreatedEventDto     = { id: BlockId; data: TextDto; previousBlockId: BlockId | null; parentBlockId: BlockId | null }
export type BlockDataUpdatedEventDto = { id: BlockId; data: TextDto }
export type BlockRemovedEventDto     = { id: BlockId }
export type BlockMovedEventDto       = { id: BlockId; previousBlockId: BlockId | null; parentBlockId: BlockId | null }

export type BlockEditorEventDtoMap = {
  selectionChange:  BlockSelection | null
  blockCreated:     BlockCreatedEventDto
  blockDataUpdated: BlockDataUpdatedEventDto
  blockRemoved:     BlockRemovedEventDto
  blockMoved:       BlockMovedEventDto
}

export interface BlockEditorOptions {
  dataUpdateDebounceMs?: number  // default 1000
  /** Maximum time to defer the event — fires even during continuous rapid typing once this limit is reached. Default 10000. */
  dataUpdateMaxWaitMs?:  number  // default 10000
}

export const BLOCK_EDITOR_EVENT_NAMES = [
  'selectionChange', 'blockCreated', 'blockDataUpdated', 'blockRemoved', 'blockMoved',
] as const satisfies ReadonlyArray<keyof BlockEditorEventDtoMap>

// Compile-time exhaustiveness checks: both directions must hold
type _AllIncluded = keyof BlockEditorEventDtoMap extends (typeof BLOCK_EDITOR_EVENT_NAMES)[number] ? true : never
type _NoExtras    = (typeof BLOCK_EDITOR_EVENT_NAMES)[number] extends keyof BlockEditorEventDtoMap ? true : never

// Re-export so consumers can do instanceof checks
export { BlockOffset, BlockRange }
