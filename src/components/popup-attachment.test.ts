import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computePosition } from './popup-attachment'

vi.mock('svelte', () => ({
  mount:   vi.fn(() => ({})),
  unmount: vi.fn(),
}))
vi.mock('./popup-container.svelte', () => ({ default: {} }))

const VIEWPORT_W = 1024, VIEWPORT_H = 768, POPUP_HEIGHT = 300
const POPUP_WIDTH = 320, MARGIN = 8

describe('computePosition', () => {
  it('places popup centered below row in unconstrained space', () => {
    // x=400, row: top=390, bottom=410
    const { left, top } = computePosition(400, 390, 410, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H)
    expect(left).toBe(400 - POPUP_WIDTH / 2)   // centered on cursor
    expect(top).toBe(410)                        // below row bottom
  })

  it('clamps to right margin when cursor near right edge', () => {
    const { left } = computePosition(VIEWPORT_W - 10, 390, 410, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H)
    expect(left).toBe(VIEWPORT_W - POPUP_WIDTH - MARGIN)
  })

  it('clamps to left margin when cursor near left edge', () => {
    const { left } = computePosition(4, 390, 410, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H)
    expect(left).toBeGreaterThanOrEqual(MARGIN)
  })

  it('flips above row when near bottom edge', () => {
    // anchorTop=VH-30=738, anchorBottom=VH-10=758
    const { top } = computePosition(400, VIEWPORT_H - 30, VIEWPORT_H - 10, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H)
    expect(top).toBe(VIEWPORT_H - 30 - POPUP_HEIGHT)  // flipped above row top
  })

  it('clamps to top margin when both vertical sides overflow', () => {
    const { top } = computePosition(400, 4, 24, POPUP_WIDTH, 800, VIEWPORT_W, VIEWPORT_H)
    expect(top).toBeGreaterThanOrEqual(MARGIN)
  })
})

describe('popup hover persistence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks() })

  function makeAnchor() {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
  }

  it('does not hide while cursor is inside popup container', async () => {
    const { mount, unmount } = await import('svelte')
    const { popupOnHover } = await import('./popup-attachment')
    const el = makeAnchor()
    const cleanup = popupOnHover({ title: 'T', body: 'B' })(el) as () => void

    el.dispatchEvent(new MouseEvent('mouseenter', { clientX: 100, clientY: 100 }))
    expect(mount).toHaveBeenCalledTimes(1)

    // Leave anchor, enter container before timeout fires
    el.dispatchEvent(new MouseEvent('mouseleave'))
    const container = document.body.lastElementChild as HTMLElement
    container.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(200)
    expect(unmount).not.toHaveBeenCalled()

    cleanup()
    el.remove()
  })

  it('hides after leaving both anchor and popup', async () => {
    const { popupOnHover } = await import('./popup-attachment')
    const el = makeAnchor()
    const cleanup = popupOnHover({ title: 'T', body: 'B' })(el) as () => void

    el.dispatchEvent(new MouseEvent('mouseenter', { clientX: 100, clientY: 100 }))
    const container = document.body.lastElementChild as HTMLElement
    el.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(200)
    expect(document.body.contains(container)).toBe(false)

    cleanup()
    el.remove()
  })

  it('closes previous group popup immediately when new one dwells long enough', async () => {
    const { mount, unmount } = await import('svelte')
    const { popupOnHover } = await import('./popup-attachment')
    const a = makeAnchor(), b = makeAnchor()
    const cleanA = popupOnHover({ title: 'A', body: '' }, 'grp')(a) as () => void
    const cleanB = popupOnHover({ title: 'B', body: '' }, 'grp')(b) as () => void

    // Open A (initial delay: 300ms)
    a.dispatchEvent(new MouseEvent('mouseenter', { clientX: 50, clientY: 50 }))
    vi.advanceTimersByTime(300)
    expect(mount).toHaveBeenCalledTimes(1)

    // Move to B — switch delay is 150ms (> close delay of 100ms)
    a.dispatchEvent(new MouseEvent('mouseleave'))
    b.dispatchEvent(new MouseEvent('mouseenter', { clientX: 60, clientY: 60 }))
    vi.advanceTimersByTime(150)

    expect(unmount).toHaveBeenCalledTimes(1)  // A closed
    expect(mount).toHaveBeenCalledTimes(2)    // B opened

    cleanA(); cleanB(); a.remove(); b.remove()
  })

  it('does not open new popup when cursor grazes a row (leaves before switch delay)', async () => {
    const { mount } = await import('svelte')
    const { popupOnHover } = await import('./popup-attachment')
    const a = makeAnchor(), b = makeAnchor()
    const cleanA = popupOnHover({ title: 'A', body: '' }, 'grp4')(a) as () => void
    const cleanB = popupOnHover({ title: 'B', body: '' }, 'grp4')(b) as () => void

    a.dispatchEvent(new MouseEvent('mouseenter', { clientX: 50, clientY: 50 }))
    vi.advanceTimersByTime(300)   // A opens
    expect(mount).toHaveBeenCalledTimes(1)

    // Cursor grazes B briefly then leaves
    a.dispatchEvent(new MouseEvent('mouseleave'))
    b.dispatchEvent(new MouseEvent('mouseenter', { clientX: 60, clientY: 60 }))
    b.dispatchEvent(new MouseEvent('mouseleave'))   // leaves before 150ms
    vi.advanceTimersByTime(200)
    expect(mount).toHaveBeenCalledTimes(1)   // B never opened

    cleanA(); cleanB(); a.remove(); b.remove()
  })

  it('requires initial dwell before first popup opens', async () => {
    const { mount } = await import('svelte')
    const { popupOnHover } = await import('./popup-attachment')
    const a = makeAnchor()
    const cleanA = popupOnHover({ title: 'A', body: '' }, 'grp5')(a) as () => void

    a.dispatchEvent(new MouseEvent('mouseenter', { clientX: 50, clientY: 50 }))
    vi.advanceTimersByTime(200)    // not yet
    expect(mount).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)    // 300ms total — now opens
    expect(mount).toHaveBeenCalledTimes(1)

    cleanA(); a.remove()
  })
})
