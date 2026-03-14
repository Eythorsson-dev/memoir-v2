import { type InlineTypes, type InlineDtoMap } from '../text/text'
import { Blocks } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'
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
  private _editor: BlockEditor
  private _toolbar: HTMLDivElement
  /**
   * Record<InlineTypes, ...> ensures TypeScript errors if any inline type
   * is missing a button. Exhaustiveness is verified at compile time.
   */
  private _inlineButtons: Record<InlineTypes, HTMLButtonElement>
  private _indentBtn: HTMLButtonElement
  private _outdentBtn: HTMLButtonElement

  constructor(container: HTMLElement, initial?: Blocks) {
    // Build toolbar
    this._toolbar = document.createElement('div')
    this._toolbar.className = 'text-editor-toolbar'

    const inlineDefs: { type: InlineTypes; icon: Parameters<typeof createElement>[0]; shortcut: string }[] = [
      { type: 'Bold', icon: Bold, shortcut: '⌘B' },
      { type: 'Italic', icon: Italic, shortcut: '⌘I' },
      { type: 'Underline', icon: Underline, shortcut: '⌘U' },
    ] satisfies { type: keyof InlineDtoMap; icon: Parameters<typeof createElement>[0]; shortcut: string }[]

    this._inlineButtons = {} as Record<InlineTypes, HTMLButtonElement>
    for (const { type, icon, shortcut } of inlineDefs) {
      const btn = document.createElement('button')
      btn.appendChild(createElement(icon))
      btn.ariaLabel = type
      btn.dataset.inlineType = type
      addTooltip(btn, type, shortcut)
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this._editor.toggleInline(type)
      })
      this._toolbar.appendChild(btn)
      this._inlineButtons[type] = btn
    }

    this._indentBtn = document.createElement('button')
    this._indentBtn.appendChild(createElement(IndentIncrease))
    this._indentBtn.ariaLabel = 'Indent'
    this._indentBtn.title = 'Indent'
    addTooltip(this._indentBtn, 'Indent', 'Tab')
    this._indentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._editor.indent()
    })
    this._toolbar.appendChild(this._indentBtn)

    this._outdentBtn = document.createElement('button')
    this._outdentBtn.appendChild(createElement(IndentDecrease))
    this._outdentBtn.ariaLabel = 'Outdent'
    this._outdentBtn.title = 'Outdent'
    addTooltip(this._outdentBtn, 'Outdent', '⇧Tab')
    this._outdentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._editor.outdent()
    })
    this._toolbar.appendChild(this._outdentBtn)

    container.appendChild(this._toolbar)

    this._editor = new BlockEditor(container, initial)

    // Update toolbar active state on selection change
    this._editor.onSelectionChange(() => {
      for (const type of Object.keys(this._inlineButtons) as InlineTypes[]) {
        const active = this._editor.isInlineActive(type)
        this._inlineButtons[type].classList.toggle('is-active', active)
      }
    })
  }

  getValue(): Blocks {
    return this._editor.getValue()
  }

  setValue(blocks: Blocks): void {
    this._editor.setValue(blocks)
  }

  onChange(cb: (b: Blocks) => void): () => void {
    return this._editor.onChange(cb)
  }

  onSelectionChange(cb: (sel: import('./BlockEditor').BlockSelection | null) => void): () => void {
    return this._editor.onSelectionChange(cb)
  }

  destroy(): void {
    this._toolbar.remove()
    this._editor.destroy()
  }
}
