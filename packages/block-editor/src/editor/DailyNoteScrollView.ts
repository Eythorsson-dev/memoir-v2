import { Blocks, BlockOffset, BlockRange, type BlockId } from '../blocks/blocks'
import type { NoteProvider } from './NoteProvider'
import type { BlockSelection } from './events'
import { BlockRenderer } from './BlockRenderer'
import { BlockHistory } from './BlockHistory'
import { BlockEventEmitter } from './BlockEventEmitter'
import { InputHandler } from './InputHandler'
import './daily-note-scroll-view.css'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface DailyNoteScrollViewOptions {
  /** Number of day sections to keep in the DOM. Default 7 (today ±3). */
  windowSize?: number
  dataUpdateDebounceMs?: number
  dataUpdateMaxWaitMs?: number
}

// ─── Internal per-day state ───────────────────────────────────────────────────

const DATA_EVENTS = ['blockCreated', 'blockDataUpdated', 'blockRemoved', 'blockMoved'] as const

interface DayState {
  date: string
  sectionEl: HTMLElement   // .daily-note-section wrapper
  contentEl: HTMLElement   // .daily-note-content — BlockRenderer target
  /** Mutable reference box so InputHandler closures always see the latest Blocks. */
  ref: { blocks: Blocks }
  history: BlockHistory
  emitter: BlockEventEmitter
  renderer: BlockRenderer
  input: InputHandler
}

// ─── DailyNoteScrollView ──────────────────────────────────────────────────────

/**
 * Infinite-scroll journal rendered into a single `contenteditable` element.
 *
 * @remarks
 * All day sections share one `<div contenteditable="true">`. Each section
 * has a `<div contenteditable="false">` date header so the cursor moves
 * freely across days while preventing header text from being edited.
 *
 * Sentinel elements outside the editable are observed by an
 * `IntersectionObserver`; when a sentinel becomes visible the window slides
 * in that direction — the oldest section is destroyed and a new one is added
 * on the opposite end.
 *
 * Cross-day boundary protection is automatic: each day has its own `Blocks`
 * state, so `InputHandler.handleBackspace` sees no previous block at offset 0
 * of the first block and returns without merging.
 */
export class DailyNoteScrollView {
  #provider: NoteProvider
  #editable: HTMLElement               // the single shared contenteditable
  #dates: string[]                     // oldest → newest
  #dayStates: Map<string, DayState>    // date → state
  #sections: Map<string, HTMLElement>  // date → sectionEl
  #topSentinel: HTMLElement
  #bottomSentinel: HTMLElement
  #observer: IntersectionObserver
  #windowSize: number
  #opts: DailyNoteScrollViewOptions
  #composing = false
  #destroyed = false

  constructor(
    container: HTMLElement,
    provider: NoteProvider,
    centerDate: string,
    opts: DailyNoteScrollViewOptions = {},
  ) {
    this.#provider = provider
    this.#windowSize = opts.windowSize ?? 7
    this.#opts = opts
    this.#dayStates = new Map()
    this.#sections = new Map()

    // Build initial date window centred on centerDate
    const half = Math.floor(this.#windowSize / 2)
    this.#dates = []
    for (let i = -half; i <= half; i++) {
      if (this.#dates.length < this.#windowSize) {
        this.#dates.push(addDays(centerDate, i))
      }
    }
    this.#dates = this.#dates.slice(0, this.#windowSize)

    // Single shared contenteditable
    this.#editable = document.createElement('div')
    this.#editable.className = 'block-editor-editable'
    this.#editable.contentEditable = 'true'
    this.#editable.setAttribute('spellcheck', 'false')

    // Sentinels live outside the editable so they don't interfere with editing
    this.#topSentinel = document.createElement('div')
    this.#topSentinel.className = 'daily-note-sentinel-top'
    this.#bottomSentinel = document.createElement('div')
    this.#bottomSentinel.className = 'daily-note-sentinel-bottom'

    container.appendChild(this.#topSentinel)
    container.appendChild(this.#editable)
    container.appendChild(this.#bottomSentinel)

    // Attach shared event handlers
    this.#editable.addEventListener('keydown', (e) => this.#handleKeyDown(e))
    this.#editable.addEventListener('input', () => this.#handleInput())
    this.#editable.addEventListener('blur', () => this.#handleBlur())
    this.#editable.addEventListener('compositionstart', () => this.#handleCompositionStart())
    this.#editable.addEventListener('compositionend', () => this.#handleCompositionEnd())

    // Mount initial sections
    for (const date of this.#dates) {
      this.#mountSection(date, 'append')
    }

    // IntersectionObserver for infinite scroll
    this.#observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target === this.#topSentinel) this.#slideUp()
        else if (entry.target === this.#bottomSentinel) this.#slideDown()
      }
    })

    this.#observer.observe(this.#topSentinel)
    this.#observer.observe(this.#bottomSentinel)
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#observer.disconnect()
    for (const dayState of this.#dayStates.values()) {
      dayState.emitter.cancelAll()
    }
  }

  // ─── Private: section lifecycle ──────────────────────────────────────────────

  #mountSection(date: string, position: 'append' | 'prepend'): void {
    const sectionEl = document.createElement('div')
    sectionEl.className = 'daily-note-section'
    sectionEl.setAttribute('data-date', date)

    // Non-editable date header
    const headerEl = document.createElement('div')
    headerEl.className = 'daily-note-header'
    headerEl.contentEditable = 'false'
    headerEl.textContent = formatDate(date)
    sectionEl.appendChild(headerEl)

    // Blocks container — BlockRenderer target
    const contentEl = document.createElement('div')
    contentEl.className = 'daily-note-content'
    sectionEl.appendChild(contentEl)

    // Insert into shared editable
    if (position === 'append') {
      this.#editable.appendChild(sectionEl)
    } else {
      const firstSection = this.#sections.size > 0 ? this.#sections.get(this.#dates[0]) : null
      if (firstSection) {
        this.#editable.insertBefore(sectionEl, firstSection)
      } else {
        this.#editable.appendChild(sectionEl)
      }
    }

    // Per-day state
    const initialBlocks = Blocks.from([Blocks.createTextBlock()])
    const ref: { blocks: Blocks } = { blocks: initialBlocks }
    const history = new BlockHistory(initialBlocks)
    const emitter = new BlockEventEmitter(
      (id: BlockId) => {
        try {
          const block = ref.blocks.getBlock(id)
          return { id, blockType: block.blockType, data: block.data }
        } catch {
          return null
        }
      },
      {
        debounceMs: this.#opts.dataUpdateDebounceMs ?? 1000,
        maxWaitMs:  this.#opts.dataUpdateMaxWaitMs  ?? 10000,
      },
    )
    const renderer = new BlockRenderer(contentEl)
    const input = new InputHandler(
      renderer,
      () => ref.blocks,
      (b) => { ref.blocks = b },
      history,
      emitter,
    )

    renderer.render(ref.blocks)

    const dayState: DayState = { date, sectionEl, contentEl, ref, history, emitter, renderer, input }
    this.#dayStates.set(date, dayState)
    this.#sections.set(date, sectionEl)

    // Load from provider
    this.#provider.load(date).then((loaded) => {
      if (this.#destroyed) return
      if (loaded !== null) {
        ref.blocks = Blocks.from(loaded)
        renderer.render(ref.blocks)
      }
    })

    // Auto-save on data changes
    for (const event of DATA_EVENTS) {
      emitter.addEventListener(event, () => {
        this.#provider.save(date, ref.blocks.blocks)
      })
    }
  }

  #unmountSection(date: string): void {
    const dayState = this.#dayStates.get(date)
    if (dayState) {
      dayState.emitter.flushAll()
      dayState.emitter.cancelAll()
      this.#dayStates.delete(date)
    }
    const sectionEl = this.#sections.get(date)
    if (sectionEl) {
      sectionEl.remove()
      this.#sections.delete(date)
    }
  }

  /** Slide window towards older dates (user scrolled up). */
  #slideUp(): void {
    const prevDate = addDays(this.#dates[0], -1)
    this.#dates.unshift(prevDate)
    this.#mountSection(prevDate, 'prepend')

    const removed = this.#dates.pop()!
    this.#unmountSection(removed)
  }

  /** Slide window towards newer dates (user scrolled down). */
  #slideDown(): void {
    const nextDate = addDays(this.#dates[this.#dates.length - 1], 1)
    this.#dates.push(nextDate)
    this.#mountSection(nextDate, 'append')

    const removed = this.#dates.shift()!
    this.#unmountSection(removed)
  }

  // ─── Private: event routing ───────────────────────────────────────────────────

  /**
   * Find the day state whose content element contains the current selection anchor.
   * Returns null when the cursor is in a header or outside all sections.
   */
  #getActiveDayState(): DayState | null {
    const domSel = window.getSelection()
    if (!domSel || domSel.rangeCount === 0) return null
    const anchor = domSel.getRangeAt(0).startContainer

    let node: Node | null = anchor
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const date = (node as Element).getAttribute?.('data-date')
        if (date) return this.#dayStates.get(date) ?? null
      }
      node = node.parentNode
    }
    return null
  }

  #handleBlur(): void {
    for (const dayState of this.#dayStates.values()) {
      dayState.emitter.flushAll()
    }
  }

  #handleCompositionStart(): void {
    const dayState = this.#getActiveDayState()
    if (!dayState) return
    const sel = dayState.renderer.getSelection()
    dayState.input.pendingSelectionBefore = sel
    if (sel instanceof BlockRange) {
      const cursor = dayState.input.deleteRange(sel)
      dayState.renderer.render(dayState.ref.blocks, cursor)
    }
    dayState.input.composing = true
    this.#composing = true
  }

  #handleCompositionEnd(): void {
    this.#composing = false
    const dayState = this.#getActiveDayState()
    if (!dayState) return
    dayState.input.composing = false
    dayState.input.handleInput()
  }

  #handleInput(): void {
    if (this.#composing) return
    const dayState = this.#getActiveDayState()
    dayState?.input.handleInput()
  }

  #handleKeyDown(e: KeyboardEvent): void {
    if (this.#composing) return

    // Undo: Ctrl/Cmd+Z
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      const dayState = this.#getActiveDayState()
      if (dayState?.history.canUndo()) {
        e.preventDefault()
        const oldBlocks = dayState.ref.blocks
        const { blocks, selection } = dayState.history.undo()
        dayState.ref.blocks = blocks
        dayState.renderer.render(blocks, selection ?? undefined)
        dayState.emitter.dispatchChanges(Blocks.diff(oldBlocks, blocks))
      }
      return
    }

    // Redo: Ctrl/Cmd+Shift+Z or Ctrl+Y
    if (
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
      (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'y')
    ) {
      const dayState = this.#getActiveDayState()
      if (dayState?.history.canRedo()) {
        e.preventDefault()
        const oldBlocks = dayState.ref.blocks
        const { blocks, selection } = dayState.history.redo()
        dayState.ref.blocks = blocks
        dayState.renderer.render(blocks, selection ?? undefined)
        dayState.emitter.dispatchChanges(Blocks.diff(oldBlocks, blocks))
      }
      return
    }

    const dayState = this.#getActiveDayState()
    if (!dayState) return

    const sel = dayState.renderer.getSelection()
    dayState.input.pendingSelectionBefore = sel

    if (e.key === 'Enter') {
      e.preventDefault()
      if (sel) dayState.input.handleEnter(sel)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (sel) {
        const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
        const toId   = sel instanceof BlockRange ? sel.end.blockId   : sel.blockId
        this.#applyBlocksChange(dayState, (b) => e.shiftKey ? b.unindent(fromId, toId) : b.indent(fromId, toId), sel)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      if (sel instanceof BlockRange) {
        this.#applyBlocksChange(dayState, (b) => b.toggleInline(sel, 'Bold'), sel)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      if (sel instanceof BlockRange) {
        this.#applyBlocksChange(dayState, (b) => b.toggleInline(sel, 'Italic'), sel)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault()
      if (sel instanceof BlockRange) {
        this.#applyBlocksChange(dayState, (b) => b.toggleInline(sel, 'Underline'), sel)
      }
      return
    }

    if (e.key === 'Backspace') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        dayState.input.handleBackspace(sel)
        return
      }
      if (sel instanceof BlockOffset && sel.offset === 0) {
        // Prevent browser from merging across day boundaries
        e.preventDefault()
        dayState.input.handleBackspace(sel)
        return
      }
      return
    }

    if (e.key === 'Delete') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        dayState.input.handleDelete(sel)
        return
      }
      if (sel instanceof BlockOffset) {
        const block = dayState.ref.blocks.getBlock(sel.blockId)
        if (sel.offset === block.getLength()) {
          // Prevent browser from merging across day boundaries
          e.preventDefault()
          dayState.input.handleDelete(sel)
          return
        }
      }
      return
    }

    // Printable char with range selection — delete range then insert char
    if (
      sel instanceof BlockRange &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      dayState.input.insertCharOverRange(sel, e.key)
      return
    }
  }

  // ─── Private: state mutation helpers ─────────────────────────────────────────

  #applyBlocksChange(
    dayState: DayState,
    mutate: (b: Blocks) => Blocks,
    sel: BlockSelection,
  ): void {
    const oldBlocks = dayState.ref.blocks
    dayState.ref.blocks = mutate(oldBlocks)
    dayState.renderer.render(dayState.ref.blocks, sel)
    const changes = Blocks.diff(oldBlocks, dayState.ref.blocks)
    if (changes.length > 0) {
      const selAfter = dayState.renderer.getSelection()
      dayState.history.add(changes, dayState.input.pendingSelectionBefore, selAfter)
    }
    dayState.input.pendingSelectionBefore = null
    dayState.emitter.dispatchChanges(changes)
  }
}
