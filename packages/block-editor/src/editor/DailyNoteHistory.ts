import type { Blocks, BlockId } from '../blocks/blocks'
import type { BlockSelection } from './events'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteSnapshot {
  noteId: string
  blocksBefore: Blocks
  blocksAfter: Blocks
}

interface SelectionPoint {
  noteId: string
  selection: BlockSelection | null
}

interface Entry {
  notes: NoteSnapshot[]
  selectionBefore: SelectionPoint | null
  selectionAfter: SelectionPoint | null
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
 * Each entry stores a list of `NoteSnapshot` objects (one per affected note),
 * plus optional selection positions for cursor restoration. Single-note
 * operations use one snapshot; cross-day operations use multiple snapshots
 * so that undo/redo restores all affected sections atomically.
 *
 * Unlike `BlockHistory`, which reconstructs state from a change-event log,
 * `DailyNoteHistory` stores explicit snapshots. This allows a single stack
 * to span multiple notes without needing a per-note base.
 *
 * @example
 * const history = new DailyNoteHistory()
 * history.add('2024-01-15', blocksBeforeEdit, blocksAfterEdit, selBefore, selAfter)
 * const { notes, selectionNoteId, selection } = history.undo()
 * // noteId in notes[0] tells the caller which section to re-render
 */
export class DailyNoteHistory {
  static readonly MAX_DEPTH = 100

  #entries: Entry[] = []
  #pointer = 0

  canUndo(): boolean {
    return this.#pointer > 0
  }

  canRedo(): boolean {
    return this.#pointer < this.#entries.length
  }

  /**
   * Record a structural change affecting a single note (Enter, Backspace, indent, etc.)
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
    this.#push({
      notes: [{ noteId, blocksBefore, blocksAfter }],
      selectionBefore: selectionBefore !== null ? { noteId, selection: selectionBefore } : null,
      selectionAfter: selectionAfter !== null ? { noteId, selection: selectionAfter } : null,
      coalesceKey: null,
    })
  }

  /**
   * Record a change that spans multiple notes atomically (e.g. cross-day deletion).
   *
   * @remarks
   * Undo/redo restores every snapshot in `notes` in a single step, so all
   * affected sections are updated together without requiring multiple Cmd+Z presses.
   *
   * @param notes - One snapshot per affected note, each with `noteId`, `blocksBefore`, `blocksAfter`.
   * @param selectionAfter - Note and cursor position after the change, for redo cursor placement.
   */
  addMulti(
    notes: Array<{ noteId: string; blocksBefore: Blocks; blocksAfter: Blocks }>,
    selectionAfter: { noteId: string; selection: BlockSelection | null } | null,
  ): void {
    if (notes.length === 0) return
    this.#push({
      notes,
      selectionBefore: null,
      selectionAfter,
      coalesceKey: null,
    })
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
   * @param selectionBefore - Cursor/selection before this change.
   * @param selectionAfter - Cursor/selection after this change.
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
        notes: [{ noteId, blocksBefore: lastEntry.notes[0].blocksBefore, blocksAfter }],
        selectionAfter: selectionAfter !== null ? { noteId, selection: selectionAfter } : null,
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
   * `notes` contains one entry per affected section — callers must restore
   * all of them. For single-note changes this is always a one-element array.
   * `selectionNoteId` and `selection` indicate where to place the cursor after
   * restoring state; both are null when no cursor position was recorded.
   *
   * @throws {Error} When there is nothing to undo.
   * @returns `{ notes, selectionNoteId, selection }` where each `notes` entry
   *   has `noteId` and `blocks` (the pre-change snapshot to restore).
   */
  undo(): {
    notes: Array<{ noteId: string; blocks: Blocks }>
    selectionNoteId: string | null
    selection: BlockSelection | null
  } {
    if (!this.canUndo()) throw new Error('Nothing to undo')
    const entry = this.#entries[this.#pointer - 1]
    this.#pointer--
    return {
      notes: entry.notes.map(n => ({ noteId: n.noteId, blocks: n.blocksBefore })),
      selectionNoteId: entry.selectionBefore?.noteId ?? null,
      selection: entry.selectionBefore?.selection ?? null,
    }
  }

  /**
   * Redo the most recently undone change.
   *
   * @remarks
   * `notes` contains one entry per affected section — callers must restore
   * all of them. `selectionNoteId` and `selection` indicate where to place
   * the cursor after restoring state.
   *
   * @throws {Error} When there is nothing to redo.
   * @returns `{ notes, selectionNoteId, selection }` where each `notes` entry
   *   has `noteId` and `blocks` (the post-change snapshot to restore).
   */
  redo(): {
    notes: Array<{ noteId: string; blocks: Blocks }>
    selectionNoteId: string | null
    selection: BlockSelection | null
  } {
    if (!this.canRedo()) throw new Error('Nothing to redo')
    const entry = this.#entries[this.#pointer]
    this.#pointer++
    return {
      notes: entry.notes.map(n => ({ noteId: n.noteId, blocks: n.blocksAfter })),
      selectionNoteId: entry.selectionAfter?.noteId ?? null,
      selection: entry.selectionAfter?.selection ?? null,
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  #push(entry: Entry): void {
    // Clear redo stack
    this.#entries.splice(this.#pointer)
    this.#entries.push(entry)
    this.#pointer++
    // Cap at MAX_DEPTH
    if (this.#entries.length > DailyNoteHistory.MAX_DEPTH) {
      this.#entries.shift()
      this.#pointer--
    }
  }
}
