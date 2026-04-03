import { DailyNoteEditor } from './DailyNoteEditor'
import type { NoteProvider } from './NoteProvider'
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

// ─── Options ──────────────────────────────────────────────────────────────────

export interface DailyNoteScrollViewOptions {
  /** Number of day sections to keep in the DOM. Default 7 (today ±3). */
  windowSize?: number
  dataUpdateDebounceMs?: number
  dataUpdateMaxWaitMs?: number
}

// ─── DailyNoteScrollView ──────────────────────────────────────────────────────

/**
 * Infinite-scroll journal that renders a rolling window of `DailyNoteEditor` sections.
 *
 * @remarks
 * Maintains `windowSize` day sections in the DOM. Sentinel elements at the top
 * and bottom are observed by an `IntersectionObserver`; when a sentinel becomes
 * visible the window slides in that direction — the oldest section is destroyed
 * and a new one is created on the opposite end.
 *
 * Arrow keys at section boundaries are intercepted so the cursor moves naturally
 * between sections without merging their content.
 */
export class DailyNoteScrollView {
  #container: HTMLElement
  #provider: NoteProvider
  #dates: string[]                        // oldest → newest
  #editors: Map<string, DailyNoteEditor>  // date → editor
  #sections: Map<string, HTMLElement>     // date → section element
  #topSentinel: HTMLElement
  #bottomSentinel: HTMLElement
  #observer: IntersectionObserver
  #windowSize: number
  #opts: DailyNoteScrollViewOptions
  #destroyed = false

  constructor(
    container: HTMLElement,
    provider: NoteProvider,
    centerDate: string,
    opts: DailyNoteScrollViewOptions = {},
  ) {
    this.#container = container
    this.#provider = provider
    this.#windowSize = opts.windowSize ?? 7
    this.#opts = opts
    this.#editors = new Map()
    this.#sections = new Map()

    // Build initial date window centred on centerDate
    const half = Math.floor(this.#windowSize / 2)
    this.#dates = []
    for (let i = -half; i <= half; i++) {
      if (this.#dates.length < this.#windowSize) {
        this.#dates.push(addDays(centerDate, i))
      }
    }
    // If windowSize is even, the loop above produces windowSize+1 entries; trim.
    this.#dates = this.#dates.slice(0, this.#windowSize)

    // Sentinels
    this.#topSentinel = document.createElement('div')
    this.#topSentinel.className = 'daily-note-sentinel-top'
    this.#bottomSentinel = document.createElement('div')
    this.#bottomSentinel.className = 'daily-note-sentinel-bottom'

    container.appendChild(this.#topSentinel)
    container.appendChild(this.#bottomSentinel)
    for (const date of this.#dates) {
      this.#mountSection(date, 'append')
    }

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
    for (const editor of this.#editors.values()) {
      editor.destroy()
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  #mountSection(date: string, position: 'append' | 'prepend'): void {
    const sectionEl = document.createElement('div')
    sectionEl.className = 'daily-note-section'
    sectionEl.setAttribute('data-date', date)

    if (position === 'append') {
      this.#bottomSentinel
        ? this.#container.insertBefore(sectionEl, this.#bottomSentinel)
        : this.#container.appendChild(sectionEl)
    } else {
      const firstSection = this.#sections.size > 0
        ? this.#sections.get(this.#dates[0])
        : null
      if (firstSection) {
        this.#container.insertBefore(sectionEl, firstSection)
      } else {
        this.#container.insertBefore(sectionEl, this.#topSentinel.nextSibling)
      }
    }

    const editor = new DailyNoteEditor(sectionEl, this.#provider, date, {
      dataUpdateDebounceMs: this.#opts.dataUpdateDebounceMs,
      dataUpdateMaxWaitMs: this.#opts.dataUpdateMaxWaitMs,
      onTopBoundaryEscape: () => this.#focusPrevSection(date),
      onBottomBoundaryEscape: () => this.#focusNextSection(date),
    })

    this.#editors.set(date, editor)
    this.#sections.set(date, sectionEl)
  }

  #unmountSection(date: string): void {
    const editor = this.#editors.get(date)
    if (editor) {
      editor.destroy()
      this.#editors.delete(date)
    }
    const sectionEl = this.#sections.get(date)
    if (sectionEl) {
      sectionEl.remove()
      this.#sections.delete(date)
    }
  }

  /** Slide the window towards older dates (user scrolled up). */
  #slideUp(): void {
    const prevDate = addDays(this.#dates[0], -1)
    this.#dates.unshift(prevDate)
    this.#mountSection(prevDate, 'prepend')

    const removed = this.#dates.pop()!
    this.#unmountSection(removed)
  }

  /** Slide the window towards newer dates (user scrolled down). */
  #slideDown(): void {
    const nextDate = addDays(this.#dates[this.#dates.length - 1], 1)
    this.#dates.push(nextDate)
    this.#mountSection(nextDate, 'append')

    const removed = this.#dates.shift()!
    this.#unmountSection(removed)
  }

  #focusPrevSection(date: string): void {
    const idx = this.#dates.indexOf(date)
    if (idx <= 0) return
    const prevDate = this.#dates[idx - 1]
    this.#editors.get(prevDate)?.focusEnd()
  }

  #focusNextSection(date: string): void {
    const idx = this.#dates.indexOf(date)
    if (idx < 0 || idx >= this.#dates.length - 1) return
    const nextDate = this.#dates[idx + 1]
    this.#editors.get(nextDate)?.focusStart()
  }
}
