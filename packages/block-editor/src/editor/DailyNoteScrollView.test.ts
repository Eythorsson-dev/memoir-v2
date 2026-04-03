import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DailyNoteScrollView } from './DailyNoteScrollView'
import type { NoteProvider } from './NoteProvider'

// ─── IntersectionObserver mock ────────────────────────────────────────────────

type IoCallback = (entries: IntersectionObserverEntry[]) => void

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []

  #callback: IoCallback
  #targets: Element[] = []

  constructor(callback: IoCallback) {
    this.#callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.#targets.push(target)
  }

  unobserve(target: Element): void {
    this.#targets = this.#targets.filter(t => t !== target)
  }

  disconnect(): void {
    this.#targets = []
  }

  takeRecords(): IntersectionObserverEntry[] { return [] }

  /** Test helper: simulate a target becoming visible. */
  triggerIntersect(target: Element): void {
    this.#callback([{
      target,
      isIntersecting: true,
      intersectionRatio: 1,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
      time: Date.now(),
    }])
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeProvider(): NoteProvider {
  return {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

function makeContainer(): HTMLElement {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return div
}

/** Set a DOM selection that spans from one day section to another. */
function setCrossDayRange(container: HTMLElement, startDate: string, endDate: string): void {
  const startBlock = container.querySelector(`[data-date="${startDate}"] .daily-note-content .block`)!
  const endBlock   = container.querySelector(`[data-date="${endDate}"] .daily-note-content .block`)!
  const startEl = startBlock.querySelector('p, h1, h2, h3')!
  const endEl   = endBlock.querySelector('p, h1, h2, h3')!
  const range = document.createRange()
  range.setStart(startEl, 0)
  range.setEnd(endEl, 0)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('DailyNoteScrollView', () => {
  const containers: HTMLElement[] = []
  const views: DailyNoteScrollView[] = []

  beforeEach(() => {
    MockIntersectionObserver.instances.length = 0
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    views.forEach(v => v.destroy())
    containers.forEach(c => c.remove())
    views.length = 0
    containers.length = 0
    vi.unstubAllGlobals()
  })

  function make(
    provider: NoteProvider = makeProvider(),
    centerDate = '2024-01-15',
    opts: { windowSize?: number } = {},
  ): { view: DailyNoteScrollView; container: HTMLElement } {
    const container = makeContainer()
    containers.push(container)
    const view = new DailyNoteScrollView(container, provider, centerDate, opts)
    views.push(view)
    return { view, container }
  }

  // ─── Single contenteditable ────────────────────────────────────────────────

  it('uses a single contenteditable for all day sections', () => {
    const { container } = make()
    expect(container.querySelectorAll('[contenteditable="true"]').length).toBe(1)
  })

  it('renders block elements inside every day section', () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    expect(sections.length).toBe(3)
    for (const section of sections) {
      expect(section.querySelectorAll('.block').length).toBeGreaterThan(0)
    }
  })

  it('renders non-editable date headers inside each section', () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const headers = Array.from(container.querySelectorAll('.daily-note-header'))
    expect(headers.length).toBe(3)
    for (const header of headers) {
      expect((header as HTMLElement).contentEditable).toBe('false')
    }
  })

  // ─── Backspace boundary protection ────────────────────────────────────────

  it('Backspace at offset 0 of the first block of a section does not cross into the previous section', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    // sections: 2024-01-14 | 2024-01-15 | 2024-01-16

    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement
    await vi.waitFor(() => expect(container.querySelectorAll('.block').length).toBeGreaterThan(0))

    const blockCountBefore = container.querySelectorAll('.block').length

    // Focus the first block of the middle section (2024-01-15)
    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    const middleSection = sections.find(s => s.getAttribute('data-date') === '2024-01-15')!
    const content = middleSection.querySelector('.daily-note-content')!
    const firstBlock = content.querySelector('.block')!
    const p = firstBlock.querySelector('p, h1, h2, h3')!
    const range = document.createRange()
    range.setStart(p, 0)
    range.setEnd(p, 0)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))

    // Block count must not decrease — no cross-day merge
    expect(container.querySelectorAll('.block').length).toBe(blockCountBefore)
  })

  // ─── Rendering ─────────────────────────────────────────────────────────────

  it('renders the default window of 7 day sections', () => {
    const { container } = make()
    expect(container.querySelectorAll('.daily-note-section').length).toBe(7)
  })

  it('respects custom windowSize option', () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    expect(container.querySelectorAll('.daily-note-section').length).toBe(3)
  })

  it('renders a section for centerDate', () => {
    const { container } = make(makeProvider(), '2024-01-15')
    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    const dates = sections.map(s => s.getAttribute('data-date'))
    expect(dates).toContain('2024-01-15')
  })

  it('renders sections for days before and after centerDate', () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    const dates = sections.map(s => s.getAttribute('data-date'))
    expect(dates).toContain('2024-01-14')
    expect(dates).toContain('2024-01-15')
    expect(dates).toContain('2024-01-16')
  })

  it('loads notes via provider for each rendered section', () => {
    const provider = makeProvider()
    make(provider, '2024-01-15', { windowSize: 3 })
    expect(provider.load).toHaveBeenCalledTimes(3)
  })

  // ─── Rolling window — scroll down ──────────────────────────────────────────

  it('appends next day and removes oldest when bottom sentinel fires', () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })

    const io = MockIntersectionObserver.instances[0]
    const bottomSentinel = container.querySelector('.daily-note-sentinel-bottom')!
    io.triggerIntersect(bottomSentinel)

    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    expect(sections.length).toBe(3)
    const dates = sections.map(s => s.getAttribute('data-date'))
    expect(dates).not.toContain('2024-01-14')
    expect(dates).toContain('2024-01-17')
  })

  // ─── Rolling window — scroll up ────────────────────────────────────────────

  it('prepends previous day and removes newest when top sentinel fires', () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })

    const io = MockIntersectionObserver.instances[0]
    const topSentinel = container.querySelector('.daily-note-sentinel-top')!
    io.triggerIntersect(topSentinel)

    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    expect(sections.length).toBe(3)
    const dates = sections.map(s => s.getAttribute('data-date'))
    expect(dates).not.toContain('2024-01-16')
    expect(dates).toContain('2024-01-13')
  })

  // ─── Cross-day selection ──────────────────────────────────────────────────

  it('cross-day Backspace calls preventDefault and preserves all day sections', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement
    await vi.waitFor(() => expect(container.querySelectorAll('.block').length).toBe(3))

    setCrossDayRange(container, '2024-01-14', '2024-01-15')

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    editable.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(container.querySelectorAll('.daily-note-section').length).toBe(3)
    expect(container.querySelector('[data-date="2024-01-14"]')).toBeTruthy()
    expect(container.querySelector('[data-date="2024-01-15"]')).toBeTruthy()
  })

  it('cross-day Backspace places the cursor in the end day', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement
    await vi.waitFor(() => expect(container.querySelectorAll('.block').length).toBe(3))

    setCrossDayRange(container, '2024-01-14', '2024-01-15')
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))

    const endSection = container.querySelector('[data-date="2024-01-15"]')!
    const endContent = endSection.querySelector('.daily-note-content')!
    const anchor = window.getSelection()!.anchorNode
    expect(endContent.contains(anchor)).toBe(true)
  })

  it('cross-day Enter calls preventDefault and preserves all day sections', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement
    await vi.waitFor(() => expect(container.querySelectorAll('.block').length).toBe(3))

    setCrossDayRange(container, '2024-01-14', '2024-01-15')

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    editable.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(container.querySelectorAll('.daily-note-section').length).toBe(3)
  })

  it('cross-day character input calls preventDefault and preserves all day sections', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement
    await vi.waitFor(() => expect(container.querySelectorAll('.block').length).toBe(3))

    setCrossDayRange(container, '2024-01-14', '2024-01-15')

    const event = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    editable.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(container.querySelectorAll('.daily-note-section').length).toBe(3)
  })

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  it('destroy disconnects the IntersectionObserver', () => {
    const { view } = make()
    const io = MockIntersectionObserver.instances[0]
    const disconnectSpy = vi.spyOn(io, 'disconnect')
    view.destroy()
    views.splice(views.indexOf(view), 1)
    expect(disconnectSpy).toHaveBeenCalled()
  })
})
