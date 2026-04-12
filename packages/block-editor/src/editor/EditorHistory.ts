import { Blocks, BlockDataChanged, type BlockId, type BlocksChange } from '../blocks/blocks'
import type { BlockSelection } from './events'

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * What `InputHandler` sees — no scopeId, no undo/redo.
 *
 * @remarks
 * Obtained via `EditorHistory.forSection`. Each section gets its own handle
 * that records changes into the shared undo stack.
 */
export interface ISectionHistory {
  add(base: Blocks, changes: BlocksChange[], selBefore: BlockSelection | null, selAfter: BlockSelection | null): void
  updateOrAdd(blockId: BlockId, base: Blocks, changes: BlocksChange[], selBefore: BlockSelection | null, selAfter: BlockSelection | null): void
  reset(base: Blocks): void
}

/**
 * Behavioural interface — only undo/redo. Suitable for passing to toolbar or
 * keyboard-handler code that should not record entries.
 */
export interface IEditorHistory {
  canUndo(): boolean
  canRedo(): boolean
  undo(): void
  redo(): void
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface SectionEntry {
  scopeId:  string
  base:     Blocks
  changes:  BlocksChange[]
  selBefore: BlockSelection | null
  selAfter:  BlockSelection | null
}

interface StackEntry {
  sections:    SectionEntry[]
  coalesceKey: string | null
}

// ─── EditorHistory ────────────────────────────────────────────────────────────

/**
 * Unified event-replay undo/redo stack shared across one or more editor sections.
 *
 * @remarks
 * Create one instance per editor (or per `DailyNoteScrollView`). For each
 * editable section, call `forSection(id, applyFn)` to obtain an
 * `ISectionHistory` handle. The handle records changes into this shared stack;
 * `undo()` / `redo()` dispatch directly to the registered `applyFn` callbacks
 * without returning data.
 *
 * Use `batch(fn)` to group changes from multiple sections into a single
 * atomic undo step (e.g. cross-day deletion).
 *
 * @example
 * const history = new EditorHistory()
 * const sh = history.forSection('2024-01-15', (blocks, sel) => {
 *   section.applyBlocks(blocks, sel)
 * })
 * sh.add(oldBlocks, changes, selBefore, selAfter)
 * history.undo()  // calls applyFn(oldBlocks, selBefore)
 */
export class EditorHistory implements IEditorHistory {
  static readonly MAX_DEPTH = 100

  #stack: StackEntry[] = []
  #pointer = 0
  #applyFns = new Map<string, (blocks: Blocks, sel: BlockSelection | undefined) => void>()
  #batching = false
  #batchEntry: StackEntry | null = null

  /**
   * Register a section and return its `ISectionHistory` handle.
   *
   * @param scopeId - Unique identifier for this section (e.g. an ISO date string).
   * @param applyFn - Called by `undo()` / `redo()` to apply blocks and
   *   optionally restore a cursor. `sel` is `undefined` when no selection was
   *   recorded.
   */
  forSection(
    scopeId: string,
    applyFn: (blocks: Blocks, sel: BlockSelection | undefined) => void,
  ): ISectionHistory {
    this.#applyFns.set(scopeId, applyFn)
    return {
      add: (base, changes, selBefore, selAfter) =>
        this.#addForSection(scopeId, base, changes, selBefore, selAfter),
      updateOrAdd: (blockId, base, changes, selBefore, selAfter) =>
        this.#updateOrAddForSection(scopeId, blockId, base, changes, selBefore, selAfter),
      reset: () => this.#resetStack(),
    }
  }

  /**
   * Group multiple `add()` calls from any section into one atomic undo step.
   *
   * @remarks
   * Any `add` or `updateOrAdd` calls made inside `fn` are collected and pushed
   * as a single `StackEntry`. A batch that makes no additions produces no entry.
   *
   * @param fn - Synchronous function containing the grouped mutations.
   */
  batch(fn: () => void): void {
    this.#batching = true
    this.#batchEntry = { sections: [], coalesceKey: null }
    try {
      fn()
    } finally {
      this.#batching = false
      if (this.#batchEntry && this.#batchEntry.sections.length > 0) {
        this.#pushEntry(this.#batchEntry)
      }
      this.#batchEntry = null
    }
  }

  canUndo(): boolean {
    return this.#pointer > 0
  }

  canRedo(): boolean {
    return this.#pointer < this.#stack.length
  }

  /**
   * Undo the most recent change, calling each section's registered `applyFn`.
   *
   * @throws {Error} When there is nothing to undo.
   */
  undo(): void {
    if (!this.canUndo()) throw new Error('Nothing to undo')
    const entry = this.#stack[this.#pointer - 1]
    this.#pointer--
    for (const section of entry.sections) {
      const applyFn = this.#applyFns.get(section.scopeId)
      applyFn?.(section.base, section.selBefore ?? undefined)
    }
  }

  /**
   * Redo the most recently undone change, calling each section's registered `applyFn`.
   *
   * @throws {Error} When there is nothing to redo.
   */
  redo(): void {
    if (!this.canRedo()) throw new Error('Nothing to redo')
    const entry = this.#stack[this.#pointer]
    this.#pointer++
    for (const section of entry.sections) {
      const applyFn = this.#applyFns.get(section.scopeId)
      if (applyFn) {
        const afterBlocks = Blocks.fromEvents(section.base, section.changes)
        applyFn(afterBlocks, section.selAfter ?? undefined)
      }
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  #addForSection(
    scopeId: string,
    base: Blocks,
    changes: BlocksChange[],
    selBefore: BlockSelection | null,
    selAfter: BlockSelection | null,
  ): void {
    if (this.#batching && this.#batchEntry) {
      // When the same section contributes multiple mutations to a batch (e.g.
      // a cross-day deletion that first trims then merges the same day),
      // merge them into one SectionEntry: keep the earliest base + selBefore,
      // accumulate all changes, and use the latest selAfter.
      const existing = this.#batchEntry.sections.find(s => s.scopeId === scopeId)
      if (existing) {
        existing.changes.push(...changes)
        existing.selAfter = selAfter
      } else {
        this.#batchEntry.sections.push({ scopeId, base, changes, selBefore, selAfter })
      }
    } else {
      this.#pushEntry({ sections: [{ scopeId, base, changes, selBefore, selAfter }], coalesceKey: null })
    }
  }

  #updateOrAddForSection(
    scopeId: string,
    blockId: BlockId,
    base: Blocks,
    changes: BlocksChange[],
    selBefore: BlockSelection | null,
    selAfter: BlockSelection | null,
  ): void {
    const coalesceKey = `${scopeId}:${blockId}`
    const lastEntry = this.#pointer > 0 ? this.#stack[this.#pointer - 1] : null

    if (
      lastEntry !== null &&
      lastEntry.coalesceKey === coalesceKey &&
      lastEntry.sections.length === 1 &&
      lastEntry.sections[0].changes.length === 1 &&
      lastEntry.sections[0].changes[0] instanceof BlockDataChanged
    ) {
      // Coalesce: preserve original base and selBefore, update changes and selAfter
      const orig = lastEntry.sections[0]
      this.#stack[this.#pointer - 1] = {
        coalesceKey,
        sections: [{
          scopeId,
          base:      orig.base,
          changes,
          selBefore: orig.selBefore,
          selAfter,
        }],
      }
    } else {
      // Add as a new entry
      this.#stack.splice(this.#pointer)
      this.#stack.push({
        sections: [{ scopeId, base, changes, selBefore, selAfter }],
        coalesceKey,
      })
      this.#pointer++
      if (this.#stack.length > EditorHistory.MAX_DEPTH) {
        this.#stack.shift()
        this.#pointer--
      }
    }
  }

  #resetStack(): void {
    this.#stack = []
    this.#pointer = 0
  }

  #pushEntry(entry: StackEntry): void {
    this.#stack.splice(this.#pointer)
    this.#stack.push(entry)
    this.#pointer++
    if (this.#stack.length > EditorHistory.MAX_DEPTH) {
      this.#stack.shift()
      this.#pointer--
    }
  }
}
