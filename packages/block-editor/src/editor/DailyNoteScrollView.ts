import { Blocks, BlockOffset, BlockRange, BlockDataChanged } from '../blocks/blocks'
import type { NoteProvider } from './NoteProvider'
import type { BlockSelection } from './events'
import { getBlockElement, getBlockElementContent, getCharOffset } from './BlockRenderer'
import { DailyNoteHistory } from './DailyNoteHistory'
import { DaySection } from './DaySection'
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
  /**
   * Called with the ISO date strings of every section currently visible
   * in the viewport, in document order, whenever that set changes.
   *
   * @param dates - ISO date strings of the visible sections, oldest → newest.
   *
   * @example
   * onVisibleDatesChange: (dates) => {
   *   const today = new Date().toISOString().slice(0, 10)
   *   showJumpToToday = !dates.includes(today)
   * }
   */
  onVisibleDatesChange?: (dates: readonly string[]) => void
}

// ─── Internal per-day state ───────────────────────────────────────────────────

interface CrossDaySelection {
  startDay: DaySection
  startBlockId: string
  startOffset: number
  endDay: DaySection
  endBlockId: string
  endOffset: number
  middleDays: DaySection[]
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
  #daySections: Map<string, DaySection>   // date → DaySection
  #sectionElements: Map<string, HTMLElement>  // date → sectionEl
  #topSentinel: HTMLElement
  #bottomSentinel: HTMLElement
  #observer: IntersectionObserver
  #visibilityObserver: IntersectionObserver | null = null
  #visibleDates: Set<string> = new Set()
  #scrollRoot: HTMLElement | null = null
  #windowSize: number
  #centerDate: string
  #opts: DailyNoteScrollViewOptions
  #composing = false
  #destroyed = false
  #dailyNoteHistory = new DailyNoteHistory()

  constructor(
    container: HTMLElement,
    provider: NoteProvider,
    centerDate: string,
    opts: DailyNoteScrollViewOptions = {},
  ) {
    this.#provider = provider
    this.#windowSize = opts.windowSize ?? 7
    this.#centerDate = centerDate
    this.#opts = opts
    this.#daySections = new Map()
    this.#sectionElements = new Map()

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

    // The scroll root is the container's parent (e.g. .scroller). Using the
    // viewport root would never fire because the sentinel elements are clipped
    // inside the scroll container and never intersect the actual viewport.
    const scrollRoot = container.parentElement
    this.#scrollRoot = scrollRoot instanceof HTMLElement ? scrollRoot : null

    // IntersectionObserver for infinite scroll
    this.#observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target === this.#topSentinel) this.#slideUp()
        else if (entry.target === this.#bottomSentinel) this.#slideDown()
      }
    }, { root: scrollRoot })

    // IntersectionObserver for viewport-visible date tracking
    if (opts.onVisibleDatesChange) {
      this.#visibilityObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const date = (entry.target as HTMLElement).dataset.date
          if (!date) continue
          if (entry.isIntersecting) {
            this.#visibleDates.add(date)
          } else {
            this.#visibleDates.delete(date)
          }
        }
        this.#notifyVisibleDates()
      }, { root: scrollRoot })
      for (const sectionEl of this.#sectionElements.values()) {
        this.#visibilityObserver.observe(sectionEl)
      }
    }

    // Scroll to today's section, then start watching sentinels.
    // Sentinel observation must begin only after the initial scroll position
    // is set — at scrollTop=0 the top sentinel is visible, which would
    // immediately trigger a spurious #slideUp and start an oscillation loop.
    requestAnimationFrame(() => {
      this.#sectionElements.get(centerDate)?.scrollIntoView({ block: 'start', behavior: 'instant' })
      this.#observer.observe(this.#topSentinel)
      this.#observer.observe(this.#bottomSentinel)
    })
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#observer.disconnect()
    this.#visibilityObserver?.disconnect()
    for (const section of this.#daySections.values()) {
      section.destroy()
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

    const dateSpan = document.createElement('span')
    dateSpan.className = 'daily-note-header-date'
    dateSpan.textContent = formatDate(date)
    headerEl.appendChild(dateSpan)

    const todayDate = new Date().toISOString().slice(0, 10)
    if (date === todayDate) {
      sectionEl.setAttribute('data-today', 'true')
      const badge = document.createElement('span')
      badge.className = 'daily-note-today-badge'
      badge.textContent = 'today'
      headerEl.appendChild(badge)
    }

    sectionEl.appendChild(headerEl)

    // Blocks container — DaySection target
    const contentEl = document.createElement('div')
    contentEl.className = 'daily-note-content'
    sectionEl.appendChild(contentEl)

    this.#visibilityObserver?.observe(sectionEl)

    // Insert into shared editable
    if (position === 'append') {
      this.#editable.appendChild(sectionEl)
    } else {
      const firstSection = this.#sectionElements.size > 0 ? this.#sectionElements.get(this.#dates[0]) : null
      if (firstSection) {
        this.#editable.insertBefore(sectionEl, firstSection)
      } else {
        this.#editable.appendChild(sectionEl)
      }
    }

    const section = new DaySection(contentEl, date, {
      debounceMs: this.#opts.dataUpdateDebounceMs ?? 1000,
      maxWaitMs:  this.#opts.dataUpdateMaxWaitMs  ?? 10000,
    })
    section.onDataChange(() => this.#provider.save(date, section.blocks.blocks))
    this.#daySections.set(date, section)
    this.#sectionElements.set(date, sectionEl)

    // Load from provider
    this.#provider.load(date).then((loaded) => {
      if (this.#destroyed) return
      if (loaded !== null) {
        section.load(Blocks.from(loaded))
      }
    })
  }

  #unmountSection(date: string): void {
    const section = this.#daySections.get(date)
    if (section) {
      section.destroy()
      this.#daySections.delete(date)
    }
    const sectionEl = this.#sectionElements.get(date)
    if (sectionEl) {
      this.#visibilityObserver?.unobserve(sectionEl)
      this.#visibleDates.delete(date)
      sectionEl.remove()
      this.#sectionElements.delete(date)
    }
  }

  /**
   * Scroll to today's section. If today has been slid out of the window,
   * reinitializes the window around today first.
   */
  scrollToToday(): void {
    const todaySection = this.#sectionElements.get(this.#centerDate)
    if (todaySection) {
      todaySection.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }

    // Today is outside the current window — rebuild around it
    const half = Math.floor(this.#windowSize / 2)
    const newDates: string[] = []
    for (let i = -half; i <= half; i++) {
      if (newDates.length < this.#windowSize) newDates.push(addDays(this.#centerDate, i))
    }

    for (const date of [...this.#dates]) this.#unmountSection(date)
    this.#dates = newDates.slice(0, this.#windowSize)
    for (const date of this.#dates) this.#mountSection(date, 'append')

    requestAnimationFrame(() => {
      this.#sectionElements.get(this.#centerDate)?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }

  /** Slide window towards older dates (user scrolled up). */
  #slideUp(): void {
    const prevDate = addDays(this.#dates[0], -1)
    this.#mountSection(prevDate, 'prepend')
    this.#dates.unshift(prevDate)

    // After prepending, the new section pushes all existing content down, but
    // scrollTop is unchanged — the top sentinel stays visible and would fire
    // again immediately. Compensate by advancing scrollTop by the new section's
    // height so the viewport stays at the same visual position.
    const newEl = this.#sectionElements.get(prevDate)
    const newHeight = newEl?.offsetHeight ?? 0
    if (this.#scrollRoot && newHeight > 0) {
      this.#scrollRoot.scrollTo({ top: this.#scrollRoot.scrollTop + newHeight, behavior: 'instant' })
    }

    const removed = this.#dates.pop()!
    this.#unmountSection(removed)
  }

  /** Slide window towards newer dates (user scrolled down). */
  #slideDown(): void {
    const nextDate = addDays(this.#dates[this.#dates.length - 1], 1)
    this.#dates.push(nextDate)
    this.#mountSection(nextDate, 'append')

    // Read the height of the section we are about to remove from the top
    // before it leaves the DOM, then subtract it from scrollTop so the user
    // stays at the same visual position.
    const removed = this.#dates.shift()!
    const removedEl = this.#sectionElements.get(removed)
    const removedHeight = removedEl?.offsetHeight ?? 0
    this.#unmountSection(removed)
    // Only compensate when the removed section was fully above the viewport.
    // If scrollTop < removedHeight the section was still partially visible and
    // no correction is needed (or the result would be negative).
    if (this.#scrollRoot && removedHeight > 0 && this.#scrollRoot.scrollTop >= removedHeight) {
      this.#scrollRoot.scrollTo({ top: this.#scrollRoot.scrollTop - removedHeight, behavior: 'instant' })
    }
  }

  #notifyVisibleDates(): void {
    const ordered = this.#dates.filter((d) => this.#visibleDates.has(d))
    this.#opts.onVisibleDatesChange?.(ordered)
  }

  // ─── Private: event routing ───────────────────────────────────────────────────

  /** Walk up from `node` to find the `.daily-note-section[data-date]` ancestor. */
  #getDaySectionForNode(node: Node): DaySection | null {
    let current: Node | null = node
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const date = (current as Element).getAttribute?.('data-date')
        if (date) return this.#daySections.get(date) ?? null
      }
      current = current.parentNode
    }
    return null
  }

  /**
   * Find the day section whose content element contains the current selection anchor.
   * Returns null when the cursor is in a header or outside all sections.
   */
  #getActiveDaySection(): DaySection | null {
    const domSel = window.getSelection()
    if (!domSel || domSel.rangeCount === 0) return null
    return this.#getDaySectionForNode(domSel.getRangeAt(0).startContainer)
  }

  /** True when the DOM selection spans two different day sections. */
  #isCrossDaySelection(): boolean {
    const domSel = window.getSelection()
    if (!domSel || domSel.isCollapsed || domSel.rangeCount === 0) return false
    const a = this.#getDaySectionForNode(domSel.anchorNode!)
    const f = this.#getDaySectionForNode(domSel.focusNode!)
    return a !== null && f !== null && a !== f
  }

  /**
   * Resolve a cross-day DOM selection into structured start/end state.
   * Returns null if the selection is collapsed, same-day, or doesn't map to
   * identifiable block elements.
   */
  #getCrossDaySelection(): CrossDaySelection | null {
    const domSel = window.getSelection()
    if (!domSel || domSel.isCollapsed || domSel.rangeCount === 0) return null

    const anchorDay = this.#getDaySectionForNode(domSel.anchorNode!)
    const focusDay  = this.#getDaySectionForNode(domSel.focusNode!)
    if (!anchorDay || !focusDay || anchorDay === focusDay) return null

    // Determine document order (anchor may come after focus for backwards selections)
    const anchorFirst = !!(
      domSel.anchorNode!.compareDocumentPosition(domSel.focusNode!) &
      Node.DOCUMENT_POSITION_FOLLOWING
    )

    const startDay  = anchorFirst ? anchorDay  : focusDay
    const startNode = anchorFirst ? domSel.anchorNode! : domSel.focusNode!
    const startOff  = anchorFirst ? domSel.anchorOffset : domSel.focusOffset
    const endDay    = anchorFirst ? focusDay   : anchorDay
    const endNode   = anchorFirst ? domSel.focusNode!  : domSel.anchorNode!
    const endOff    = anchorFirst ? domSel.focusOffset : domSel.anchorOffset

    const startBlockEl = getBlockElement(startNode)
    const endBlockEl   = getBlockElement(endNode)
    if (!startBlockEl || !endBlockEl) return null

    const startP = getBlockElementContent(startBlockEl)
    const endP   = getBlockElementContent(endBlockEl)
    const startCharOff = getCharOffset(startP, startNode, startOff)
    const endCharOff   = getCharOffset(endP,   endNode,   endOff)
    if (startCharOff === -1 || endCharOff === -1) return null

    const startIdx = this.#dates.indexOf(startDay.date)
    const endIdx   = this.#dates.indexOf(endDay.date)
    const middleDays: DaySection[] = []
    for (let i = startIdx + 1; i < endIdx; i++) {
      const d = this.#daySections.get(this.#dates[i])
      if (d) middleDays.push(d)
    }

    return {
      startDay, startBlockId: startBlockEl.id, startOffset: startCharOff,
      endDay,   endBlockId:   endBlockEl.id,   endOffset:   endCharOff,
      middleDays,
    }
  }

  /**
   * Delete the cross-day selection:
   * 1. Trim start day: keep content before selection start.
   * 2. Clear middle days to a single empty block.
   * 3. Trim end day: remove content before selection end; cursor lands at offset 0
   *    of the first remaining block in the end day.
   *
   * Returns the cursor `BlockOffset` in the end day, or null on failure.
   */
  #handleCrossDayDeletion(cs: CrossDaySelection): BlockOffset {
    // 1. Trim start day: delete from selection start to end of start day
    const startLastBlock = cs.startDay.blocks.blocks.at(-1)!
    const needsStartTrim =
      cs.startBlockId !== startLastBlock.id ||
      cs.startOffset !== startLastBlock.getLength()
    if (needsStartTrim) {
      cs.startDay.pendingSelectionBefore = null
      cs.startDay.deleteRange(new BlockRange(
        new BlockOffset(cs.startBlockId, cs.startOffset),
        new BlockOffset(startLastBlock.id, startLastBlock.getLength()),
      ))
      cs.startDay.render()
    }

    // 2. Clear middle days
    for (const mid of cs.middleDays) {
      const cleared = Blocks.from([Blocks.createTextBlock()])
      const old = mid.blocks
      mid.blocks = cleared
      mid.render()
      mid.dispatchChanges(Blocks.diff(old, cleared))
    }

    // 3. Trim end day: delete from start of end day to selection end
    const endFirstBlock = cs.endDay.blocks.blocks[0]
    const endRangeCollapsed =
      endFirstBlock.id === cs.endBlockId && cs.endOffset === 0
    if (!endRangeCollapsed) {
      cs.endDay.pendingSelectionBefore = null
      const cursor = cs.endDay.deleteRange(new BlockRange(
        new BlockOffset(endFirstBlock.id, 0),
        new BlockOffset(cs.endBlockId, cs.endOffset),
      ))
      cs.endDay.render(cursor)
      return cursor
    }
    // Nothing to trim — place cursor at start of first block in end day
    const cursor = new BlockOffset(endFirstBlock.id, 0)
    cs.endDay.render(cursor)
    return cursor
  }

  #handleCrossDayEnter(cs: CrossDaySelection): void {
    this.#handleCrossDayDeletion(cs)
  }

  #handleCrossDayCharInput(cs: CrossDaySelection, char: string): void {
    const cursor = this.#handleCrossDayDeletion(cs)
    const state = cs.endDay.blocks
    const block = state.getBlock(cursor.blockId)
    const newText = block.getText().insert(cursor.offset, char)
    const newCursor = new BlockOffset(cursor.blockId, cursor.offset + 1)
    cs.endDay.blocks = state.update(cursor.blockId, newText)
    cs.endDay.render(newCursor)
    cs.endDay.scheduleDataUpdated(cursor.blockId)
  }

  #handleBlur(): void {
    for (const section of this.#daySections.values()) {
      section.flushAll()
    }
  }

  #handleCompositionStart(): void {
    const section = this.#getActiveDaySection()
    if (!section) return
    const sel = section.getSelection()
    section.pendingSelectionBefore = sel
    if (sel instanceof BlockRange) {
      const cursor = section.deleteRange(sel)
      section.render(cursor)
    }
    section.composing = true
    this.#composing = true
  }

  #handleCompositionEnd(): void {
    this.#composing = false
    const section = this.#getActiveDaySection()
    if (!section) return
    section.composing = false
    this.#recordInput(section)
  }

  #handleInput(): void {
    if (this.#composing) return
    const section = this.#getActiveDaySection()
    if (!section) return
    this.#recordInput(section)
  }

  #recordInput(section: DaySection): void {
    const blocksBefore = section.blocks
    const selBefore = section.pendingSelectionBefore
    const currentSel = section.getSelection()
    const blockId = currentSel instanceof BlockOffset ? currentSel.blockId : null

    section.handleInput()

    const blocksAfter = section.blocks
    if (blocksAfter !== blocksBefore) {
      const selAfter = section.getSelection()
      const diff = Blocks.diff(blocksBefore, blocksAfter)
      if (diff.length === 1 && diff[0] instanceof BlockDataChanged && blockId) {
        this.#dailyNoteHistory.updateOrAdd(section.date, blockId, blocksBefore, blocksAfter, selBefore, selAfter)
      } else {
        this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, selBefore, selAfter)
      }
    }
  }

  #handleKeyDown(e: KeyboardEvent): void {
    if (this.#composing) return

    // Undo: Ctrl/Cmd+Z — delegates to global DailyNoteHistory
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (this.#dailyNoteHistory.canUndo()) {
        const { noteId, blocks: newBlocks, selection } = this.#dailyNoteHistory.undo()
        const section = this.#daySections.get(noteId)
        if (section) {
          const oldBlocks = section.blocks
          section.blocks = newBlocks
          section.render(selection ?? undefined)
          section.dispatchChanges(Blocks.diff(oldBlocks, newBlocks))
        }
      }
      return
    }

    // Redo: Ctrl/Cmd+Shift+Z or Ctrl+Y — delegates to global DailyNoteHistory
    if (
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
      (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'y')
    ) {
      e.preventDefault()
      if (this.#dailyNoteHistory.canRedo()) {
        const { noteId, blocks: newBlocks, selection } = this.#dailyNoteHistory.redo()
        const section = this.#daySections.get(noteId)
        if (section) {
          const oldBlocks = section.blocks
          section.blocks = newBlocks
          section.render(selection ?? undefined)
          section.dispatchChanges(Blocks.diff(oldBlocks, newBlocks))
        }
      }
      return
    }

    // Cross-day selection: block destructive operations that would merge sections
    if (this.#isCrossDaySelection()) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        const cs = this.#getCrossDaySelection()
        if (cs) this.#handleCrossDayDeletion(cs)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cs = this.#getCrossDaySelection()
        if (cs) this.#handleCrossDayEnter(cs)
        return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const cs = this.#getCrossDaySelection()
        if (cs) this.#handleCrossDayCharInput(cs, e.key)
        return
      }
    }

    const section = this.#getActiveDaySection()
    if (!section) return

    const sel = section.getSelection()
    section.pendingSelectionBefore = sel

    if (e.key === 'Enter') {
      e.preventDefault()
      if (sel) {
        const blocksBefore = section.blocks
        section.handleEnter(sel)
        const blocksAfter = section.blocks
        if (blocksAfter !== blocksBefore) {
          const selAfter = section.getSelection()
          this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, sel, selAfter)
        }
      }
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (sel) {
        const fromId = sel instanceof BlockRange ? sel.start.blockId : sel.blockId
        const toId   = sel instanceof BlockRange ? sel.end.blockId   : sel.blockId
        this.#applyBlocksChange(section, (b) => e.shiftKey ? b.unindent(fromId, toId) : b.indent(fromId, toId), sel)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      if (sel instanceof BlockRange) {
        this.#applyBlocksChange(section, (b) => b.toggleInline(sel, 'Bold'), sel)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      if (sel instanceof BlockRange) {
        this.#applyBlocksChange(section, (b) => b.toggleInline(sel, 'Italic'), sel)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault()
      if (sel instanceof BlockRange) {
        this.#applyBlocksChange(section, (b) => b.toggleInline(sel, 'Underline'), sel)
      }
      return
    }

    if (e.key === 'Backspace') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        const blocksBefore = section.blocks
        section.handleBackspace(sel)
        const blocksAfter = section.blocks
        if (blocksAfter !== blocksBefore) {
          const selAfter = section.getSelection()
          this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, sel, selAfter)
        }
        return
      }
      if (sel instanceof BlockOffset && sel.offset === 0) {
        // Prevent browser from merging across day boundaries
        e.preventDefault()
        const blocksBefore = section.blocks
        section.handleBackspace(sel)
        const blocksAfter = section.blocks
        if (blocksAfter !== blocksBefore) {
          const selAfter = section.getSelection()
          this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, sel, selAfter)
        }
        return
      }
      return
    }

    if (e.key === 'Delete') {
      if (sel instanceof BlockRange) {
        e.preventDefault()
        const blocksBefore = section.blocks
        section.handleDelete(sel)
        const blocksAfter = section.blocks
        if (blocksAfter !== blocksBefore) {
          const selAfter = section.getSelection()
          this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, sel, selAfter)
        }
        return
      }
      if (sel instanceof BlockOffset) {
        const block = section.blocks.getBlock(sel.blockId)
        if (sel.offset === block.getLength()) {
          // Prevent browser from merging across day boundaries
          e.preventDefault()
          const blocksBefore = section.blocks
          section.handleDelete(sel)
          const blocksAfter = section.blocks
          if (blocksAfter !== blocksBefore) {
            const selAfter = section.getSelection()
            this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, sel, selAfter)
          }
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
      const blocksBefore = section.blocks
      section.insertCharOverRange(sel, e.key)
      const blocksAfter = section.blocks
      if (blocksAfter !== blocksBefore) {
        const selAfter = section.getSelection()
        this.#dailyNoteHistory.add(section.date, blocksBefore, blocksAfter, sel, selAfter)
      }
      return
    }
  }

  // ─── Private: state mutation helpers ─────────────────────────────────────────

  #applyBlocksChange(
    section: DaySection,
    mutate: (b: Blocks) => Blocks,
    sel: BlockSelection,
  ): void {
    const oldBlocks = section.blocks
    section.blocks = mutate(oldBlocks)
    section.render(sel)
    const changes = Blocks.diff(oldBlocks, section.blocks)
    if (changes.length > 0) {
      const selAfter = section.getSelection()
      this.#dailyNoteHistory.add(section.date, oldBlocks, section.blocks, section.pendingSelectionBefore, selAfter)
    }
    section.pendingSelectionBefore = null
    section.dispatchChanges(changes)
  }
}
