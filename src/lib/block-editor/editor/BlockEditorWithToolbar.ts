import { type InlineTypes, type InlineDtoMap, type HighlightColor, type Shade } from '../text/text'
import { Blocks } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'
import type { BlockEditorEventDtoMap, BlockEditorOptions } from './events'
import { createElement, Bold, Italic, Underline, IndentIncrease, IndentDecrease, Undo2, Redo2, ListOrdered, List, Highlighter, ChevronDown } from 'lucide'
import './block-editor-toolbar.css'
import './highlight-picker.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const HIGHLIGHT_COLORS: HighlightColor[] = ['red', 'amber', 'green', 'blue', 'violet', 'fuchsia']
const HIGHLIGHT_SHADES: Shade[] = ['light', 'medium', 'dark']

const DEFAULT_HIGHLIGHT: { color: HighlightColor; shade: Shade } = { color: 'amber', shade: 'medium' }
const DEFAULT_STORAGE_KEY = 'previous-highlight'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** Tailwind light-mode swatch background colours for the toolbar colour bar. */
const COLOR_BAR_BG: Record<HighlightColor, Record<Shade, string>> = {
  red:     { light: '#fee2e2', medium: '#fca5a5', dark: '#dc2626' },
  amber:   { light: '#fef3c7', medium: '#fcd34d', dark: '#d97706' },
  green:   { light: '#dcfce7', medium: '#86efac', dark: '#16a34a' },
  blue:    { light: '#dbeafe', medium: '#93c5fd', dark: '#2563eb' },
  violet:  { light: '#ede9fe', medium: '#c4b5fd', dark: '#7c3aed' },
  fuchsia: { light: '#fae8ff', medium: '#f0abfc', dark: '#c026d3' },
}

// ─── BlockEditorWithToolbar ───────────────────────────────────────────────────

export class BlockEditorWithToolbar {
  #editor: BlockEditor
  #toolbar: HTMLDivElement
  #container: HTMLElement
  /**
   * Record<InlineTypes, ...> ensures TypeScript errors if any inline type
   * is missing a button. Exhaustiveness is verified at compile time.
   */
  #inlineButtons: Record<InlineTypes, HTMLButtonElement>
  #indentBtn: HTMLButtonElement
  #outdentBtn: HTMLButtonElement
  #undoBtn: HTMLButtonElement
  #redoBtn: HTMLButtonElement
  #orderedListBtn: HTMLButtonElement
  #unorderedListBtn: HTMLButtonElement

  // Highlight split-button state
  #highlightMainBtn: HTMLButtonElement
  #highlightColorBar: HTMLSpanElement
  #highlightPicker: HTMLDivElement
  #highlightSwatches: Map<string, HTMLButtonElement> = new Map()
  #lastUsed: { color: HighlightColor; shade: Shade }
  #storageKey: string

  #unsubscribeSelection: () => void

  constructor(container: HTMLElement, initial?: Blocks, opts: BlockEditorOptions = {}) {
    this.#container = container
    this.#storageKey = opts.highlightStorageKey ?? DEFAULT_STORAGE_KEY
    this.#lastUsed = this.#loadLastUsed()

    // Build toolbar
    this.#toolbar = document.createElement('div')
    this.#toolbar.className = 'text-editor-toolbar'
    this.#toolbar.role = 'toolbar'
    this.#toolbar.setAttribute('aria-label', 'Text formatting')

    const inlineDefs: { type: InlineTypes; icon: Parameters<typeof createElement>[0]; shortcut: string }[] = [
      { type: 'Bold', icon: Bold, shortcut: '⌘B' },
      { type: 'Italic', icon: Italic, shortcut: '⌘I' },
      { type: 'Underline', icon: Underline, shortcut: '⌘U' },
    ] satisfies { type: keyof Omit<InlineDtoMap, 'Highlight'>; icon: Parameters<typeof createElement>[0]; shortcut: string }[]

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
        this.#editor.toggleInline(type as 'Bold' | 'Italic' | 'Underline')
      })
      this.#toolbar.appendChild(btn)
      this.#inlineButtons[type] = btn
    }

    // ── Highlight split button ──────────────────────────────────────────────

    const splitWrapper = document.createElement('div')
    splitWrapper.className = 'toolbar-highlight-split'
    splitWrapper.style.position = 'relative'

    this.#highlightMainBtn = document.createElement('button')
    this.#highlightMainBtn.className = 'highlight-main-btn'
    this.#highlightMainBtn.setAttribute('aria-label', 'Highlight')
    this.#highlightMainBtn.setAttribute('aria-pressed', 'false')
    addTooltip(this.#highlightMainBtn, 'Highlight', '⌘⇧H')
    this.#highlightMainBtn.appendChild(createElement(Highlighter))

    this.#highlightColorBar = document.createElement('span')
    this.#highlightColorBar.className = 'highlight-color-bar'
    this.#updateColorBar()
    this.#highlightMainBtn.appendChild(this.#highlightColorBar)

    this.#highlightMainBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#closePicker()
      if (this.#editor.isInlineActive('Highlight')) {
        this.#editor.removeInlineFromSelection('Highlight')
      } else {
        this.#editor.toggleInline('Highlight', this.#lastUsed)
        this.#saveLastUsed(this.#lastUsed)
      }
    })

    const chevronBtn = document.createElement('button')
    chevronBtn.className = 'highlight-chevron-btn'
    chevronBtn.setAttribute('aria-label', 'Highlight color options')
    chevronBtn.setAttribute('aria-haspopup', 'true')
    chevronBtn.setAttribute('aria-expanded', 'false')
    chevronBtn.appendChild(createElement(ChevronDown))
    chevronBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#togglePicker(chevronBtn)
    })

    // ── Picker popover ──────────────────────────────────────────────────────

    this.#highlightPicker = document.createElement('div')
    this.#highlightPicker.className = 'highlight-picker'
    this.#highlightPicker.setAttribute('role', 'dialog')
    this.#highlightPicker.setAttribute('aria-label', 'Highlight color')

    const grid = document.createElement('div')
    grid.className = 'highlight-picker-grid'

    // Grid: 3 rows (shades) × 6 columns (colors)
    for (const shade of HIGHLIGHT_SHADES) {
      for (const color of HIGHLIGHT_COLORS) {
        const swatch = document.createElement('button')
        swatch.className = 'highlight-picker-swatch'
        swatch.dataset.color = color
        swatch.dataset.shade = shade
        const label = `${color} ${shade}`
        swatch.setAttribute('aria-label', label)
        swatch.title = label

        swatch.addEventListener('mousedown', (e) => {
          e.preventDefault()
          this.#closePicker()
          this.#editor.toggleInline('Highlight', { color, shade })
          this.#setLastUsed({ color, shade })
        })

        grid.appendChild(swatch)
        this.#highlightSwatches.set(`${color}-${shade}`, swatch)
      }
    }

    const removeBtn = document.createElement('button')
    removeBtn.className = 'highlight-picker-remove'
    removeBtn.textContent = 'Remove highlight'
    removeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#closePicker()
      this.#editor.removeInlineFromSelection('Highlight')
    })

    this.#highlightPicker.appendChild(grid)
    this.#highlightPicker.appendChild(removeBtn)

    splitWrapper.appendChild(this.#highlightMainBtn)
    splitWrapper.appendChild(chevronBtn)
    splitWrapper.appendChild(this.#highlightPicker)
    this.#toolbar.appendChild(splitWrapper)

    // Register highlight button for the active-state loop
    this.#inlineButtons['Highlight'] = this.#highlightMainBtn

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

    const sep3 = document.createElement('div')
    sep3.className = 'toolbar-separator'
    sep3.setAttribute('aria-hidden', 'true')
    this.#toolbar.appendChild(sep3)

    this.#orderedListBtn = document.createElement('button')
    this.#orderedListBtn.appendChild(createElement(ListOrdered))
    this.#orderedListBtn.setAttribute('aria-label', 'Ordered list')
    this.#orderedListBtn.setAttribute('aria-pressed', 'false')
    addTooltip(this.#orderedListBtn, 'Ordered list')
    this.#orderedListBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const newType = this.#editor.isBlockTypeActive('ordered-list') ? 'text' : 'ordered-list'
      this.#editor.convertBlockType(newType)
    })
    this.#toolbar.appendChild(this.#orderedListBtn)

    this.#unorderedListBtn = document.createElement('button')
    this.#unorderedListBtn.appendChild(createElement(List))
    this.#unorderedListBtn.setAttribute('aria-label', 'Unordered list')
    this.#unorderedListBtn.setAttribute('aria-pressed', 'false')
    addTooltip(this.#unorderedListBtn, 'Unordered list')
    this.#unorderedListBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const newType = this.#editor.isBlockTypeActive('unordered-list') ? 'text' : 'unordered-list'
      this.#editor.convertBlockType(newType)
    })
    this.#toolbar.appendChild(this.#unorderedListBtn)

    container.appendChild(this.#toolbar)

    this.#editor = new BlockEditor(container, initial, opts)

    this.#updateUndoRedo()

    // Cmd/Ctrl+Shift+H — apply last-used highlight or remove if already active
    container.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        if (this.#editor.isInlineActive('Highlight')) {
          this.#editor.removeInlineFromSelection('Highlight')
        } else {
          this.#editor.toggleInline('Highlight', this.#lastUsed)
          this.#saveLastUsed(this.#lastUsed)
        }
      }
    })

    // Close picker when clicking outside
    document.addEventListener('mousedown', this.#onDocumentMouseDown)

    // Update toolbar active state on selection change
    this.#unsubscribeSelection = this.#editor.addEventListener('selectionChange', () => {
      for (const type of Object.keys(this.#inlineButtons) as InlineTypes[]) {
        const active = this.#editor.isInlineActive(type)
        this.#inlineButtons[type].classList.toggle('is-active', active)
        this.#inlineButtons[type].setAttribute('aria-pressed', String(active))
      }

      // Update picker swatch active states
      const activeHighlight = this.#editor.getActiveInline('Highlight')
      for (const [key, swatch] of this.#highlightSwatches) {
        const [color, shade] = key.split('-') as [HighlightColor, Shade]
        const isActive = activeHighlight?.color === color && activeHighlight?.shade === shade
        swatch.classList.toggle('is-active', isActive)
      }

      const olActive = this.#editor.isBlockTypeActive('ordered-list')
      this.#orderedListBtn.classList.toggle('is-active', olActive)
      this.#orderedListBtn.setAttribute('aria-pressed', String(olActive))
      const ulActive = this.#editor.isBlockTypeActive('unordered-list')
      this.#unorderedListBtn.classList.toggle('is-active', ulActive)
      this.#unorderedListBtn.setAttribute('aria-pressed', String(ulActive))
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

  #togglePicker(chevronBtn: HTMLButtonElement): void {
    const isOpen = this.#highlightPicker.classList.contains('is-open')
    if (isOpen) {
      this.#closePicker()
    } else {
      this.#highlightPicker.classList.add('is-open')
      chevronBtn.setAttribute('aria-expanded', 'true')
    }
  }

  #closePicker(): void {
    this.#highlightPicker.classList.remove('is-open')
    const chevron = this.#toolbar.querySelector('.highlight-chevron-btn')
    chevron?.setAttribute('aria-expanded', 'false')
  }

  #onDocumentMouseDown = (e: MouseEvent): void => {
    if (!this.#highlightPicker.classList.contains('is-open')) return
    const target = e.target as Node
    if (!this.#highlightPicker.contains(target) && !this.#toolbar.querySelector('.toolbar-highlight-split')?.contains(target)) {
      this.#closePicker()
    }
  }

  #setLastUsed(value: { color: HighlightColor; shade: Shade }): void {
    this.#lastUsed = value
    this.#updateColorBar()
    this.#saveLastUsed(value)
  }

  #updateColorBar(): void {
    this.#highlightColorBar?.style.setProperty('background-color', COLOR_BAR_BG[this.#lastUsed.color][this.#lastUsed.shade])
  }

  #loadLastUsed(): { color: HighlightColor; shade: Shade } {
    try {
      const raw = localStorage.getItem(this.#storageKey)
      if (!raw) return DEFAULT_HIGHLIGHT
      const parsed = JSON.parse(raw) as { color: HighlightColor; shade: Shade }
      if (typeof parsed.color === 'string' && typeof parsed.shade === 'string') return parsed
    } catch {
      // malformed — fall through to default
    }
    return DEFAULT_HIGHLIGHT
  }

  #saveLastUsed(value: { color: HighlightColor; shade: Shade }): void {
    try {
      localStorage.setItem(this.#storageKey, JSON.stringify(value))
    } catch {
      // storage may be unavailable (e.g. private browsing with strict settings)
    }
  }

  /**
   * Removes the toolbar and editor DOM from the page, unsubscribes from
   * selection events, and delegates to the inner editor's `destroy()`.
   */
  destroy(): void {
    this.#unsubscribeSelection()
    document.removeEventListener('mousedown', this.#onDocumentMouseDown)
    this.#toolbar.remove()
    this.#editor.destroy()
  }
}
