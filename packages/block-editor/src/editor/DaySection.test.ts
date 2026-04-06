import { describe, it, expect, afterEach, vi } from 'vitest'
import { DaySection } from './DaySection'
import { Blocks, BlockDataChanged, BlockOffset } from '../blocks/blocks'

// ─── helpers ──────────────────────────────────────────────────────────────────

const OPTS = { debounceMs: 50, maxWaitMs: 500 }

function makeContentEl(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'daily-note-content'
  document.body.appendChild(div)
  return div
}

function makeSection(date = '2024-01-15', contentEl?: HTMLElement): { section: DaySection; contentEl: HTMLElement } {
  const el = contentEl ?? makeContentEl()
  return { section: new DaySection(el, date, OPTS), contentEl: el }
}

const contentEls: HTMLElement[] = []

afterEach(() => {
  contentEls.forEach(el => el.remove())
  contentEls.length = 0
  vi.useRealTimers()
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('DaySection', () => {
  // ─── Constructor ────────────────────────────────────────────────────────────

  it('renders an initial block into contentEl on construction', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    makeSection('2024-01-15', contentEl)
    expect(contentEl.querySelectorAll('.block').length).toBeGreaterThan(0)
  })

  it('exposes the correct date', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-05-20', contentEl)
    expect(section.date).toBe('2024-05-20')
  })

  it('initialises with one empty text block', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)
    expect(section.blocks.blocks.length).toBe(1)
  })

  // ─── load() ─────────────────────────────────────────────────────────────────

  it('load() replaces blocks and re-renders', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const newBlocks = Blocks.from([Blocks.createTextBlock(), Blocks.createTextBlock()])
    section.load(newBlocks)

    expect(section.blocks).toBe(newBlocks)
    expect(contentEl.querySelectorAll('.block').length).toBe(2)
  })

  it('load() resets history so earlier placeholder blocks are not in the undo base', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const loadedBlocks = Blocks.from([Blocks.createTextBlock(), Blocks.createTextBlock()])
    section.load(loadedBlocks)

    // Place cursor in first loaded block and press Enter to produce 3 blocks
    const firstBlock = contentEl.querySelector('.block')!
    const p = firstBlock.querySelector('p, h1, h2, h3')!
    const range = document.createRange()
    range.setStart(p, 0)
    range.setEnd(p, 0)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    const sel = section.getSelection()!
    section.handleEnter(sel)
    expect(section.blocks.blocks.length).toBe(3)
  })

  // ─── blocks getter / setter ──────────────────────────────────────────────────

  it('blocks setter updates state without rendering', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const two = Blocks.from([Blocks.createTextBlock(), Blocks.createTextBlock()])
    section.blocks = two

    // State changed but DOM still shows 1 block (no render was called)
    expect(section.blocks).toBe(two)
    expect(contentEl.querySelectorAll('.block').length).toBe(1)
  })

  // ─── onDataChange ────────────────────────────────────────────────────────────

  it('onDataChange handler fires when dispatchChanges is called with a data change', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const handler = vi.fn()
    section.onDataChange(handler)

    const block = section.blocks.blocks[0]
    section.dispatchChanges([
      new BlockDataChanged(block.id, 'text', block.getText()),
    ])

    expect(handler).toHaveBeenCalledOnce()
  })

  it('onDataChange handler does not fire when dispatchChanges receives an empty array', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const handler = vi.fn()
    section.onDataChange(handler)
    section.dispatchChanges([])

    expect(handler).not.toHaveBeenCalled()
  })

  // ─── destroy() ───────────────────────────────────────────────────────────────

  it('destroy() flushes a pending scheduleDataUpdated event synchronously', () => {
    vi.useFakeTimers()
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const handler = vi.fn()
    section.onDataChange(handler)

    const blockId = section.blocks.blocks[0].id
    section.scheduleDataUpdated(blockId)

    // Handler has not fired yet — debounce timer is pending
    expect(handler).not.toHaveBeenCalled()

    // destroy() must flush synchronously
    section.destroy()
    expect(handler).toHaveBeenCalledOnce()
  })

  // ─── render() ────────────────────────────────────────────────────────────────

  it('render() reflects the current blocks state in the DOM', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const two = Blocks.from([Blocks.createTextBlock(), Blocks.createTextBlock()])
    section.blocks = two
    section.render()

    expect(contentEl.querySelectorAll('.block').length).toBe(2)
  })

  // ─── handleEnter ────────────────────────────────────────────────────────────

  it('handleEnter splits the current block into two', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const blockId = section.blocks.blocks[0].id
    section.handleEnter(new BlockOffset(blockId, 0))

    expect(section.blocks.blocks.length).toBe(2)
  })

  // ─── handleBackspace ────────────────────────────────────────────────────────

  it('handleBackspace at offset 0 of the first block is a no-op (no previous block)', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const blockId = section.blocks.blocks[0].id
    section.handleBackspace(new BlockOffset(blockId, 0))

    // Still one block — nothing to merge into
    expect(section.blocks.blocks.length).toBe(1)
  })

  it('handleBackspace merges two blocks when cursor is at offset 0 of the second block', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    // Start with two blocks
    const firstId = section.blocks.blocks[0].id
    section.handleEnter(new BlockOffset(firstId, 0))
    expect(section.blocks.blocks.length).toBe(2)

    // Backspace at offset 0 of the second block merges it into the first
    const secondId = section.blocks.blocks[1].id
    section.handleBackspace(new BlockOffset(secondId, 0))
    expect(section.blocks.blocks.length).toBe(1)
  })

  // ─── handleDelete ────────────────────────────────────────────────────────────

  it('handleDelete at end of last block is a no-op (no next block)', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const block = section.blocks.blocks[0]
    section.handleDelete(new BlockOffset(block.id, block.getLength()))

    expect(section.blocks.blocks.length).toBe(1)
  })

  it('handleDelete merges the next block when cursor is at end of the first block', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const firstId = section.blocks.blocks[0].id
    section.handleEnter(new BlockOffset(firstId, 0))
    expect(section.blocks.blocks.length).toBe(2)

    section.handleDelete(new BlockOffset(firstId, 0))
    expect(section.blocks.blocks.length).toBe(1)
  })

  // ─── flushAll ────────────────────────────────────────────────────────────────

  it('flushAll() fires pending debounced events without cancelling them', () => {
    vi.useFakeTimers()
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const handler = vi.fn()
    section.onDataChange(handler)

    const blockId = section.blocks.blocks[0].id
    section.scheduleDataUpdated(blockId)
    expect(handler).not.toHaveBeenCalled()

    section.flushAll()
    expect(handler).toHaveBeenCalledOnce()
  })
})
