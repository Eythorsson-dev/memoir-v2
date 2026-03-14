import { InlineTypes, InlineDtoMap } from '../text/text'
import { Blocks } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'

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

    const inlineDefs: { type: InlineTypes; label: string }[] = [
      { type: 'Bold', label: 'B' },
      { type: 'Italic', label: 'I' },
      { type: 'Underline', label: 'U' },
    ] satisfies { type: keyof InlineDtoMap; label: string }[]

    this._inlineButtons = {} as Record<InlineTypes, HTMLButtonElement>
    for (const { type, label } of inlineDefs) {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.dataset.inlineType = type
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this._editor.toggleInline(type)
      })
      this._toolbar.appendChild(btn)
      this._inlineButtons[type] = btn
    }

    this._indentBtn = document.createElement('button')
    this._indentBtn.textContent = '→'
    this._indentBtn.title = 'Indent'
    this._indentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._editor.indent()
    })
    this._toolbar.appendChild(this._indentBtn)

    this._outdentBtn = document.createElement('button')
    this._outdentBtn.textContent = '←'
    this._outdentBtn.title = 'Outdent'
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
