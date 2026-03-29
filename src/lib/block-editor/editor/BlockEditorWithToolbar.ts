import { type InlineTypes, type InlineDtoMap, type HighlightColor } from '../text/text'
import { Blocks, type HeaderLevel } from '../blocks/blocks'
import { BlockEditor } from './BlockEditor'
import type { BlockEditorEventDtoMap, BlockEditorOptions } from './events'
import { createElement, Bold, Italic, Underline, IndentIncrease, IndentDecrease, Undo2, Redo2, ListOrdered, List, Highlighter, ChevronDown, Heading } from 'lucide'
import './block-editor-toolbar.css'
import './highlight-picker.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const HIGHLIGHT_COLORS: HighlightColor[] = ['red', 'amber', 'green', 'blue', 'violet', 'fuchsia']

const DEFAULT_HIGHLIGHT: { color: HighlightColor } = { color: 'amber' }
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

//─── BlockEditorWithToolbar ───────────────────────────────────────────────────

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

  // Heading dropdown state
  #headingBtn: HTMLButtonElement
  #headingPicker: HTMLDivElement
  #headingLevelBtns: Map<HeaderLevel, HTMLButtonElement> = new Map()

  // Highlight split-button state
  #highlightMainBtn: HTMLButtonElement
  #highlightColorBar: HTMLSpanElement
  #highlightPicker: HTMLDivElement
  #highlightSwatches: Map<string, HTMLButtonElement> = new Map()
  #lastUsed: { color: HighlightColor }
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
        this.#editor.toggleInline('Highlight', { color: this.#lastUsed.color })
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

    // Single row — one swatch per colour
    for (const color of HIGHLIGHT_COLORS) {
      const swatch = document.createElement('button')
      swatch.className = 'highlight-picker-swatch'
      swatch.dataset.color = color
      swatch.setAttribute('aria-label', color)
      swatch.title = color

      swatch.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.#closePicker()
        this.#editor.toggleInline('Highlight', { color })
        this.#setLastUsed({ color })
      })

      grid.appendChild(swatch)
      this.#highlightSwatches.set(color, swatch)
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

    const sep4 = document.createElement('div')
    sep4.className = 'toolbar-separator'
    sep4.setAttribute('aria-hidden', 'true')
    this.#toolbar.appendChild(sep4)

    // ── Heading split button ────────────────────────────────────────────────

    const headingWrapper = document.createElement('div')
    headingWrapper.className = 'toolbar-heading-split'
    headingWrapper.style.position = 'relative'

    this.#headingBtn = document.createElement('button')
    this.#headingBtn.className = 'heading-main-btn'
    this.#headingBtn.setAttribute('aria-label', 'Heading')
    this.#headingBtn.setAttribute('aria-pressed', 'false')
    this.#headingBtn.setAttribute('aria-haspopup', 'true')
    this.#headingBtn.setAttribute('aria-expanded', 'false')
    this.#headingBtn.appendChild(createElement(Heading))
    this.#headingBtn.appendChild(createElement(ChevronDown))
    addTooltip(this.#headingBtn, 'Heading')
    this.#headingBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.#toggleHeadingPicker()
    })
    headingWrapper.appendChild(this.#headingBtn)

    this.#headingPicker = document.createElement('div')
    this.#headingPicker.className = 'heading-picker'
    this.#headingPicker.setAttribute('role', 'dialog')
    this.#headingPicker.setAttribute('aria-label', 'Heading level')

    for (const level of [1, 2, 3] as const) {
      const btn = document.createElement('button')
      btn.className = 'heading-picker-option'
      btn.setAttribute('aria-label', `Heading ${level}`)
      btn.setAttribute('aria-pressed', 'false')
      btn.textContent = `H${level}`
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.#closeHeadingPicker()
        this.#editor.convertToHeader(level)
      })
      this.#headingPicker.appendChild(btn)
      this.#headingLevelBtns.set(level, btn)
    }

    headingWrapper.appendChild(this.#headingPicker)
    this.#toolbar.appendChild(headingWrapper)

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
          this.#editor.toggleInline('Highlight', { color: this.#lastUsed.color })
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
      for (const [color, swatch] of this.#highlightSwatches) {
        swatch.classList.toggle('is-active', activeHighlight?.color === color)
      }

      const olActive = this.#editor.isBlockTypeActive('ordered-list')
      this.#orderedListBtn.classList.toggle('is-active', olActive)
      this.#orderedListBtn.setAttribute('aria-pressed', String(olActive))
      const ulActive = this.#editor.isBlockTypeActive('unordered-list')
      this.#unorderedListBtn.classList.toggle('is-active', ulActive)
      this.#unorderedListBtn.setAttribute('aria-pressed', String(ulActive))

      const activeLevel = this.#editor.getActiveHeaderLevel()
      const headingActive = activeLevel !== null
      this.#headingBtn.classList.toggle('is-active', headingActive)
      this.#headingBtn.setAttribute('aria-pressed', String(headingActive))
      for (const [level, btn] of this.#headingLevelBtns) {
        const isActive = activeLevel === level
        btn.classList.toggle('is-active', isActive)
        btn.setAttribute('aria-pressed', String(isActive))
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
    const target = e.target as Node
    if (this.#highlightPicker.classList.contains('is-open')) {
      if (!this.#highlightPicker.contains(target) && !this.#toolbar.querySelector('.toolbar-highlight-split')?.contains(target)) {
        this.#closePicker()
      }
    }
    if (this.#headingPicker.classList.contains('is-open')) {
      if (!this.#headingPicker.contains(target) && !this.#toolbar.querySelector('.toolbar-heading-split')?.contains(target)) {
        this.#closeHeadingPicker()
      }
    }
  }

  #toggleHeadingPicker(): void {
    const isOpen = this.#headingPicker.classList.contains('is-open')
    if (isOpen) {
      this.#closeHeadingPicker()
    } else {
      this.#headingPicker.classList.add('is-open')
      this.#headingBtn.setAttribute('aria-expanded', 'true')
    }
  }

  #closeHeadingPicker(): void {
    this.#headingPicker.classList.remove('is-open')
    this.#headingBtn.setAttribute('aria-expanded', 'false')
  }

  #setLastUsed(value: { color: HighlightColor }): void {
    this.#lastUsed = value
    this.#updateColorBar()
    this.#saveLastUsed(value)
  }

  #updateColorBar(): void {
    this.#highlightColorBar?.setAttribute('data-color', this.#lastUsed.color)
  }

  #loadLastUsed(): { color: HighlightColor } {
    try {
      const raw = localStorage.getItem(this.#storageKey)
      if (!raw) return DEFAULT_HIGHLIGHT
      const parsed = JSON.parse(raw) as { color: HighlightColor }
      if (typeof parsed.color === 'string') return parsed
    } catch {
      // malformed — fall through to default
    }
    return DEFAULT_HIGHLIGHT
  }

  #saveLastUsed(value: { color: HighlightColor }): void {
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
