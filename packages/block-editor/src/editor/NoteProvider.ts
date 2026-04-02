import type { AnyBlock } from '../blocks/blocks'

/**
 * Persistence contract for a note keyed by ISO date (YYYY-MM-DD).
 *
 * @remarks
 * `load` returns `null` when no note exists for the given date, allowing
 * callers to distinguish "no note yet" from "empty note". `save` is called
 * after every content change; implementations should debounce at the
 * transport layer if needed.
 */
export interface NoteProvider {
  /**
   * Load block data for `date`, or `null` if no note exists yet.
   *
   * @param date - ISO date string, e.g. `"2024-01-15"`.
   */
  load(date: string): Promise<ReadonlyArray<AnyBlock> | null>

  /**
   * Persist block data for `date`.
   *
   * @param date - ISO date string, e.g. `"2024-01-15"`.
   * @param blocks - Current block tree to persist.
   */
  save(date: string, blocks: ReadonlyArray<AnyBlock>): Promise<void>
}
