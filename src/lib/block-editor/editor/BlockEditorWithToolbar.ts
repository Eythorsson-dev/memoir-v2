import { type InlineTypes, type InlineDtoMap } from '../text/text'
import { Blocks } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'
import type { BlockEditorEventDtoMap, BlockEditorOptions } from './events'
import { createElement, Bold, Italic, Underline, IndentIncrease, IndentDecrease } from 'lucide'
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
  #unsubscribeSelection: () => void

  constructor(container: HTMLElement, initial?: Blocks, opts: BlockEditorOptions = {}) {
    // Build toolbar
    this.#toolbar = document.createElement('div')
    this.#toolbar.className = 'text-editor-toolbar'

    const inlineDefs: { type: InlineTypes; icon: Parameters<typeof createElement>[0]; shortcut: string }[] = [
      { type: 'Bold', icon: Bold, shortcut: '⌘B' },
      { type: 'Italic', icon: Italic, shortcut: '⌘I' },
      { type: 'Underline', icon: Underline, shortcut: '⌘U' },
    ] satisfies { type: keyof InlineDtoMap; icon: Parameters<typeof createElement>[0]; shortcut: string }[]

    this.#inlineButtons = {} as Record<InlineTypes, HTMLButtonElement>
    for (const { type, icon, shortcut } of inlineDefs) {
      const btn = document.createElement('button')
      btn.appendChild(createElement(icon))
      btn.ariaLabel = type
      btn.dataset.inlineType = type
      addTooltip(btn, type, shortcut)
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.#editor.toggleInline(type)
      })
      this.#toolbar.appendChild(btn)
      this.#inlineButtons[type] = btn
    }

    this.#indentBtn = document.createElement('button')
    this.#indentBtn.appendChild(createElement(IndentIncrease))
    this.#indentBtn.ariaLabel = 'Indent'
    this.#indentBtn.title = 'Indent'
    addTooltip(this.#indentBtn, 'Indent', 'Tab')
    this.#indentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#editor.indent()
    })
    this.#toolbar.appendChild(this.#indentBtn)

    this.#outdentBtn = document.createElement('button')
    this.#outdentBtn.appendChild(createElement(IndentDecrease))
    this.#outdentBtn.ariaLabel = 'Outdent'
    this.#outdentBtn.title = 'Outdent'
    addTooltip(this.#outdentBtn, 'Outdent', '⇧Tab')
    this.#outdentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#editor.outdent()
    })
    this.#toolbar.appendChild(this.#outdentBtn)

    container.appendChild(this.#toolbar)

    this.#editor = new BlockEditor(container, initial, opts)

    // Update toolbar active state on selection change
    this.#unsubscribeSelection = this.#editor.addEventListener('selectionChange', () => {
      for (const type of Object.keys(this.#inlineButtons) as InlineTypes[]) {
        this.#inlineButtons[type].classList.toggle('is-active', this.#editor.isInlineActive(type))
      }
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

  destroy(): void {
    this.#unsubscribeSelection()
    this.#toolbar.remove()
    this.#editor.destroy()
  }
}
