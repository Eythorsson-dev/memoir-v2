import { InlineTypes, InlineDtoMap } from '../text/text'
import { Blocks } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'
import { createElement, Bold, Italic, Underline, IndentIncrease, IndentDecrease } from 'lucide'

let toolbarCssInjected = false
function injectToolbarStyles(): void {
  if (toolbarCssInjected) return
  toolbarCssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .text-editor-toolbar { display: flex; align-items: center; gap: 2px; margin-bottom: 6px; }
    .text-editor-toolbar button {
      width: 28px; height: 28px;
      border: 1px solid transparent; border-radius: 5px;
      background: transparent; color: var(--toolbar-fg); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .text-editor-toolbar button:hover { background: var(--toolbar-btn-hover-bg); }
    .text-editor-toolbar button.is-active {
      background: var(--toolbar-btn-active-bg);
      border-color: var(--toolbar-btn-active-border);
      color: var(--toolbar-btn-active-color);
    }
    .text-editor-toolbar button svg { width: 16px; height: 16px; pointer-events: none; }
    .text-editor-toolbar button .tooltip {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%; transform: translateX(-50%);
      white-space: nowrap;
      background: var(--tooltip-bg);
      color: var(--tooltip-color);
      font-size: 11px; padding: 3px 8px;
      border-radius: 4px; pointer-events: none; z-index: 100;
    }
    .text-editor-toolbar button:hover .tooltip { display: block; }
    .text-editor-toolbar button .tooltip kbd {
      opacity: 0.65; font-family: inherit; margin-left: 4px;
    }
  `
  document.head.appendChild(style)
}

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
    injectToolbarStyles()

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
    addTooltip(this._indentBtn, 'Indent', 'Tab')
    this._indentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._editor.indent()
    })
    this._toolbar.appendChild(this._indentBtn)

    this._outdentBtn = document.createElement('button')
    this._outdentBtn.appendChild(createElement(IndentDecrease))
    this._outdentBtn.ariaLabel = 'Outdent'
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
