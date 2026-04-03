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
    // windowSize 3 → today ±1
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
    // Was: 2024-01-14, 2024-01-15, 2024-01-16
    // After sliding down: 2024-01-15, 2024-01-16, 2024-01-17
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
    // Was: 2024-01-14, 2024-01-15, 2024-01-16
    // After sliding up: 2024-01-13, 2024-01-14, 2024-01-15
    expect(dates).not.toContain('2024-01-16')
    expect(dates).toContain('2024-01-13')
  })

  // ─── Cross-day navigation ──────────────────────────────────────────────────

  it('ArrowUp at top of a section moves cursor to end of the previous section', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    // sections: 2024-01-14, 2024-01-15, 2024-01-16
    // Wait for editables to render
    await vi.waitFor(() => expect(container.querySelectorAll('.block-editor-editable').length).toBe(3))

    // Get the editable for 2024-01-15 (middle section, index 1)
    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    const middleSection = sections.find(s => s.getAttribute('data-date') === '2024-01-15')!
    const middleEditable = middleSection.querySelector('.block-editor-editable') as HTMLElement

    // Focus the editable and place cursor at offset 0 of the first block
    const firstBlock = middleEditable.querySelector('.block')!
    const p = firstBlock.querySelector('p, h1, h2, h3')!
    const range = document.createRange()
    range.setStart(p, 0)
    range.setEnd(p, 0)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    middleEditable.focus()

    // Dispatch ArrowUp — should trigger onTopBoundaryEscape → focusEnd on 2024-01-14
    middleEditable.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))

    // The previous section's editable should now be focused
    const prevSection = sections.find(s => s.getAttribute('data-date') === '2024-01-14')!
    const prevEditable = prevSection.querySelector('.block-editor-editable') as HTMLElement
    expect(prevEditable.contains(window.getSelection()!.anchorNode)).toBe(true)
  })

  it('ArrowDown at bottom of a section moves cursor to start of the next section', async () => {
    const { container } = make(makeProvider(), '2024-01-15', { windowSize: 3 })
    await vi.waitFor(() => expect(container.querySelectorAll('.block-editor-editable').length).toBe(3))

    const sections = Array.from(container.querySelectorAll('.daily-note-section'))
    const middleSection = sections.find(s => s.getAttribute('data-date') === '2024-01-15')!
    const middleEditable = middleSection.querySelector('.block-editor-editable') as HTMLElement

    // Place cursor at end of last block using the same offset logic as BlockRenderer:
    // for an empty block the <p> has a <br> child, so use (p, 0) as focusEnd() does.
    const blocks = Array.from(middleEditable.querySelectorAll('.block'))
    const lastBlock = blocks[blocks.length - 1]
    const p = lastBlock.querySelector('p, h1, h2, h3')!
    const range = document.createRange()
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    const textNode = walker.nextNode()
    if (textNode) {
      const len = (textNode.textContent ?? '').length
      range.setStart(textNode, len)
      range.setEnd(textNode, len)
    } else {
      range.setStart(p, 0)
      range.setEnd(p, 0)
    }
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    middleEditable.focus()

    middleEditable.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))

    const nextSection = sections.find(s => s.getAttribute('data-date') === '2024-01-16')!
    const nextEditable = nextSection.querySelector('.block-editor-editable') as HTMLElement
    expect(nextEditable.contains(window.getSelection()!.anchorNode)).toBe(true)
  })

  it('destroy disconnects the IntersectionObserver', () => {
    const { view } = make()
    const io = MockIntersectionObserver.instances[0]
    const disconnectSpy = vi.spyOn(io, 'disconnect')
    view.destroy()
    // remove from afterEach list since already destroyed
    views.splice(views.indexOf(view), 1)
    expect(disconnectSpy).toHaveBeenCalled()
  })
})
