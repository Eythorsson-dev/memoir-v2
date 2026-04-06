import type { Blocks, BlockId } from '../blocks/blocks'
import type { BlockSelection } from './events'
import type { NoteProvider } from './NoteProvider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entry {
  noteId: string
  blocksBefore: Blocks
  blocksAfter: Blocks
  selectionBefore: BlockSelection | null
  selectionAfter: BlockSelection | null
  /**
   * Coalesce key for text-change merging.
   * Set to `"${noteId}:${blockId}"` for single-block text changes,
   * `null` for structural changes that must not be merged.
   */
  coalesceKey: string | null
}

// ─── DailyNoteHistory ─────────────────────────────────────────────────────────

/**
 * Cross-day undo/redo history for a journal-style editor.
 *
 * @remarks
 * Each entry stores a `noteId` (ISO date string), a full `Blocks` snapshot
 * before and after the change, and optional selection positions for cursor
 * restoration. Undo/redo automatically calls `provider.save` so the
 * persisted note is always consistent with the current undo position.
 *
 * Unlike `BlockHistory`, which reconstructs state from a change-event log,
 * `DailyNoteHistory` stores explicit snapshots. This allows a single stack
 * to span multiple notes without needing a per-note base.
 *
 * @example
 * const history = new DailyNoteHistory(provider)
 * history.add('2024-01-15', blocksBeforeEdit, blocksAfterEdit, selBefore, selAfter)
 * const { noteId, blocks, selection } = history.undo()
 * // noteId tells the caller which section to re-render
 */
export class DailyNoteHistory {
  static readonly MAX_DEPTH = 100

  #provider: NoteProvider
  #entries: Entry[] = []
  #pointer = 0

  constructor(provider: NoteProvider) {
    this.#provider = provider
  }

  canUndo(): boolean {
    return this.#pointer > 0
  }

  canRedo(): boolean {
    return this.#pointer < this.#entries.length
  }

  /**
   * Record a structural change (Enter, Backspace, indent, inline toggle, etc.)
   *
   * @param noteId - ISO date of the affected note.
   * @param blocksBefore - Full `Blocks` snapshot before the change.
   * @param blocksAfter - Full `Blocks` snapshot after the change.
   * @param selectionBefore - Cursor/selection before the change, for restoration on undo.
   * @param selectionAfter - Cursor/selection after the change, for restoration on redo.
   */
  add(
    noteId: string,
    blocksBefore: Blocks,
    blocksAfter: Blocks,
    selectionBefore: BlockSelection | null,
    selectionAfter: BlockSelection | null,
  ): void {
    // Clear redo stack
    this.#entries.splice(this.#pointer)
    this.#entries.push({ noteId, blocksBefore, blocksAfter, selectionBefore, selectionAfter, coalesceKey: null })
    this.#pointer++
    // Cap at MAX_DEPTH
    if (this.#entries.length > DailyNoteHistory.MAX_DEPTH) {
      this.#entries.shift()
      this.#pointer--
    }
  }

  /**
   * Record or coalesce a single-block text change.
   *
   * @remarks
   * When the previous entry targets the same `noteId` and `blockId`, the
   * entry is updated in-place: the original `blocksBefore` and
   * `selectionBefore` are preserved (burst-start state), while `blocksAfter`
   * and `selectionAfter` are updated to the latest values. This groups rapid
   * character-by-character typing into a single undoable step.
   *
   * @param noteId - ISO date of the affected note.
   * @param blockId - ID of the block that received the text change.
   * @param blocksBefore - Full `Blocks` snapshot before this change.
   * @param blocksAfter - Full `Blocks` snapshot after this change.
   */
  updateOrAdd(
    noteId: string,
    blockId: BlockId,
    blocksBefore: Blocks,
    blocksAfter: Blocks,
    selectionBefore: BlockSelection | null,
    selectionAfter: BlockSelection | null,
  ): void {
    const coalesceKey = `${noteId}:${blockId}`
    const lastEntry = this.#pointer > 0 ? this.#entries[this.#pointer - 1] : null

    if (lastEntry && lastEntry.coalesceKey === coalesceKey) {
      // Coalesce: preserve original blocksBefore and selectionBefore
      this.#entries[this.#pointer - 1] = {
        ...lastEntry,
        blocksAfter,
        selectionAfter,
      }
    } else {
      this.add(noteId, blocksBefore, blocksAfter, selectionBefore, selectionAfter)
      this.#entries[this.#pointer - 1].coalesceKey = coalesceKey
    }
  }

  /**
   * Undo the most recent change.
   *
   * @remarks
   * Restores `blocksBefore` for the affected note and fires `provider.save`
   * as a side effect. The `noteId` in the return value tells the caller which
   * day section to re-render.
   *
   * @throws {Error} When there is nothing to undo.
   * @returns `{ noteId, blocks, selection }` where `blocks` is the restored
   *   snapshot and `selection` is the cursor position to restore.
   */
  undo(): { noteId: string; blocks: Blocks; selection: BlockSelection | null } {
    if (!this.canUndo()) throw new Error('Nothing to undo')
    const entry = this.#entries[this.#pointer - 1]
    this.#pointer--
    this.#provider.save(entry.noteId, entry.blocksBefore.blocks)
    return { noteId: entry.noteId, blocks: entry.blocksBefore, selection: entry.selectionBefore }
  }

  /**
   * Redo the most recently undone change.
   *
   * @remarks
   * Reapplies `blocksAfter` for the affected note and fires `provider.save`.
   * The `noteId` in the return value identifies the correct day section to
   * re-render, which may differ from the currently active section.
   *
   * @throws {Error} When there is nothing to redo.
   * @returns `{ noteId, blocks, selection }` where `blocks` is the reapplied
   *   snapshot and `selection` is the cursor position to restore.
   */
  redo(): { noteId: string; blocks: Blocks; selection: BlockSelection | null } {
    if (!this.canRedo()) throw new Error('Nothing to redo')
    const entry = this.#entries[this.#pointer]
    this.#pointer++
    this.#provider.save(entry.noteId, entry.blocksAfter.blocks)
    return { noteId: entry.noteId, blocks: entry.blocksAfter, selection: entry.selectionAfter }
  }
}
