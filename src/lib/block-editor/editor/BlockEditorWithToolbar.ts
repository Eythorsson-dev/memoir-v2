import { type InlineTypes, type InlineDtoMap } from '../text/text'
import { Blocks } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'
import type { BlockEditorEventDtoMap, BlockEditorOptions } from './events'
import { createElement, Bold, Italic, Underline, IndentIncrease, IndentDecrease, Undo2, Redo2 } from 'lucide'
import './block-editor-toolbar.css'

function addTooltip(btn: HTMLButtonElement, label: string, shortcut?: string): void {
  const tip = document.createElement('span')
  tip.className = 'tooltip'
  tip.textContent = label
  if (shortcut) {
    const kbd = document.createElement('kbd')
    kbd.textContent = shortcut
    tip.appendChild(kbd)
  }
  btn.appendChild(tip)
}

export class BlockEditorWithToolbar {
  #editor: BlockEditor
  #toolbar: HTMLDivElement
  /**
   * Record<InlineTypes, ...> ensures TypeScript errors if any inline type
   * is missing a button. Exhaustiveness is verified at compile time.
   */
  #inlineButtons: Record<InlineTypes, HTMLButtonElement>
  #indentBtn: HTMLButtonElement
  #outdentBtn: HTMLButtonElement
  #undoBtn: HTMLButtonElement
  #redoBtn: HTMLButtonElement
  #unsubscribeSelection: () => void

  constructor(container: HTMLElement, initial?: Blocks, opts: BlockEditorOptions = {}) {
    // Build toolbar
    this.#toolbar = document.createElement('div')
    this.#toolbar.className = 'text-editor-toolbar'
    this.#toolbar.role = 'toolbar'
    this.#toolbar.setAttribute('aria-label', 'Text formatting')

    const inlineDefs: { type: InlineTypes; icon: Parameters<typeof createElement>[0]; shortcut: string }[] = [
      { type: 'Bold', icon: Bold, shortcut: '⌘B' },
      { type: 'Italic', icon: Italic, shortcut: '⌘I' },
      { type: 'Underline', icon: Underline, shortcut: '⌘U' },
    ] satisfies { type: keyof InlineDtoMap; icon: Parameters<typeof createElement>[0]; shortcut: string }[]

    this.#undoBtn = document.createElement('button')
    this.#undoBtn.appendChild(createElement(Undo2))
    this.#undoBtn.ariaLabel = 'Undo'
    addTooltip(this.#undoBtn, 'Undo', '⌘Z')
    this.#undoBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#editor.undo()
      this.#updateUndoRedo()
    })
    this.#toolbar.appendChild(this.#undoBtn)

    this.#redoBtn = document.createElement('button')
    this.#redoBtn.appendChild(createElement(Redo2))
    this.#redoBtn.ariaLabel = 'Redo'
    addTooltip(this.#redoBtn, 'Redo', '⌘⇧Z')
    this.#redoBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#editor.redo()
      this.#updateUndoRedo()
    })
    this.#toolbar.appendChild(this.#redoBtn)

    const sep1 = document.createElement('div')
    sep1.className = 'toolbar-separator'
    sep1.setAttribute('aria-hidden', 'true')
    this.#toolbar.appendChild(sep1)

    this.#inlineButtons = {} as Record<InlineTypes, HTMLButtonElement>
    for (const { type, icon, shortcut } of inlineDefs) {
      const btn = document.createElement('button')
      btn.appendChild(createElement(icon))
      btn.ariaLabel = type
      btn.setAttribute('aria-pressed', 'false')
      btn.dataset.inlineType = type
      addTooltip(btn, type, shortcut)
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.#editor.toggleInline(type)
      })
      this.#toolbar.appendChild(btn)
      this.#inlineButtons[type] = btn
    }

    const sep2 = document.createElement('div')
    sep2.className = 'toolbar-separator'
    sep2.setAttribute('aria-hidden', 'true')
    this.#toolbar.appendChild(sep2)

    this.#indentBtn = document.createElement('button')
    this.#indentBtn.appendChild(createElement(IndentIncrease))
    this.#indentBtn.setAttribute('aria-label', 'Indent')
    addTooltip(this.#indentBtn, 'Indent', 'Tab')
    this.#indentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#editor.indent()
    })
    this.#toolbar.appendChild(this.#indentBtn)

    this.#outdentBtn = document.createElement('button')
    this.#outdentBtn.appendChild(createElement(IndentDecrease))
    this.#outdentBtn.setAttribute('aria-label', 'Outdent')
    addTooltip(this.#outdentBtn, 'Outdent', '⇧Tab')
    this.#outdentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#editor.outdent()
    })
    this.#toolbar.appendChild(this.#outdentBtn)

    container.appendChild(this.#toolbar)

    this.#editor = new BlockEditor(container, initial, opts)

    this.#updateUndoRedo()

    // Update toolbar active state on selection change
    this.#unsubscribeSelection = this.#editor.addEventListener('selectionChange', () => {
      for (const type of Object.keys(this.#inlineButtons) as InlineTypes[]) {
        const active = this.#editor.isInlineActive(type)
        this.#inlineButtons[type].classList.toggle('is-active', active)
        this.#inlineButtons[type].setAttribute('aria-pressed', String(active))
      }
      this.#updateUndoRedo()
    })
  }

  getValue(): Blocks {
    return this.#editor.getValue()
  }

  setValue(blocks: Blocks): void {
    this.#editor.setValue(blocks)
  }

  addEventListener<K extends keyof BlockEditorEventDtoMap>(
    event: K,
    handler: (payload: BlockEditorEventDtoMap[K]) => void,
  ): () => void {
    return this.#editor.addEventListener(event, handler)
  }

  #updateUndoRedo(): void {
    this.#undoBtn.disabled = !this.#editor.canUndo()
    this.#redoBtn.disabled = !this.#editor.canRedo()
  }

  /**
   * Removes the toolbar and editor DOM from the page, unsubscribes from
   * selection events, and delegates to the inner editor's `destroy()`.
   */
  destroy(): void {
    this.#unsubscribeSelection()
    this.#toolbar.remove()
    this.#editor.destroy()
  }
}
