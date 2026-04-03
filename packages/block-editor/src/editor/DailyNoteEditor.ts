import { Blocks } from '../blocks/blocks'
import type { BlockEditorOptions } from './events'
import { BlockEditor } from './BlockEditor'
import type { NoteProvider } from './NoteProvider'
import './daily-note-editor.css'

const DATA_EVENTS = ['blockCreated', 'blockDataUpdated', 'blockRemoved', 'blockMoved'] as const

/**
 * Single-day note editor with a read-only date header and auto-save.
 *
 * @remarks
 * Composes `BlockEditor` for the editable area and adds a non-interactive
 * date header. Block content is loaded asynchronously from `provider.load`
 * on construction and persisted on every data change via `provider.save`.
 *
 * @example
 * const editor = new DailyNoteEditor(container, provider, '2024-01-15')
 * // later:
 * editor.destroy()
 */
export class DailyNoteEditor {
  #editor: BlockEditor
  #provider: NoteProvider
  #date: string
  #destroyed = false

  constructor(container: HTMLElement, provider: NoteProvider, date: string, opts?: BlockEditorOptions) {
    this.#provider = provider
    this.#date = date

    const header = document.createElement('div')
    header.className = 'daily-note-header'
    header.textContent = DailyNoteEditor.#formatDate(date)
    container.appendChild(header)

    const editorContainer = document.createElement('div')
    editorContainer.className = 'daily-note-content'
    container.appendChild(editorContainer)

    this.#editor = new BlockEditor(editorContainer, undefined, opts)

    provider.load(date).then((blocks) => {
      if (this.#destroyed) return
      if (blocks !== null) {
        this.#editor.setValue(Blocks.from(blocks))
      }
    })

    for (const event of DATA_EVENTS) {
      this.#editor.addEventListener(event, () => this.#save())
    }
  }

  /** Place cursor at offset 0 of the first block and focus the editable. */
  focusStart(): void {
    this.#editor.focusStart()
  }

  /** Place cursor at the end of the last block and focus the editable. */
  focusEnd(): void {
    this.#editor.focusEnd()
  }

  /**
   * Remove the editor from the DOM and cancel any pending debounced events.
   *
   * @remarks
   * Safe to call at any time — if an async `load` is still in flight it will
   * be ignored once it resolves.
   */
  destroy(): void {
    this.#destroyed = true
    this.#editor.destroy()
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  static #formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  #save(): void {
    this.#provider.save(this.#date, this.#editor.getValue().blocks)
  }
}
