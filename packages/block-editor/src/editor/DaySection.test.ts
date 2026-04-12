import { describe, it, expect, afterEach, vi } from 'vitest'
import { DaySection } from './DaySection'
import { EditorHistory } from './EditorHistory'
import { Blocks, BlockDataChanged, BlockOffset } from '../blocks/blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeContentEl(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'daily-note-content'
  document.body.appendChild(div)
  return div
}

function makeSection(date = '2024-01-15', contentEl?: HTMLElement): { section: DaySection; contentEl: HTMLElement; history: EditorHistory } {
  const el = contentEl ?? makeContentEl()
  const history = new EditorHistory()
  let sectionRef: DaySection | undefined
  const sectionHistory = history.forSection(date, (blocks, sel) => sectionRef?.applyBlocks(blocks, sel))
  const section = new DaySection(el, date, { debounceMs: 50, maxWaitMs: 500, history: sectionHistory })
  sectionRef = section
  return { section, contentEl: el, history }
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
    section.load(two)
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

  // ─── applyBlocks ────────────────────────────────────────────────────────────

  it('applyBlocks() sets state, re-renders, and fires onDataChange', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const handler = vi.fn()
    section.onDataChange(handler)

    const two = Blocks.from([Blocks.createTextBlock(), Blocks.createTextBlock()])
    section.applyBlocks(two)

    expect(section.blocks).toBe(two)
    expect(contentEl.querySelectorAll('.block').length).toBe(2)
    expect(handler).toHaveBeenCalled()
  })

  it('applyBlocks() does not fire onDataChange when blocks are identical', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const handler = vi.fn()
    section.onDataChange(handler)

    // Apply the same blocks — no diff → no events
    section.applyBlocks(section.blocks)

    expect(handler).not.toHaveBeenCalled()
  })

  it('load() calls reset on the injected history', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section, history } = makeSection('2024-01-15', contentEl)

    // Record an entry so the stack is non-empty
    section.handleEnter(new BlockOffset(section.blocks.blocks[0].id, 0))
    expect(history.canUndo()).toBe(true)

    // load() should reset the history
    section.load(Blocks.from([Blocks.createTextBlock()]))
    expect(history.canUndo()).toBe(false)
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

  // ─── clearFirstBlock() ───────────────────────────────────────────────────────

  it('clearFirstBlock() sets first block text to empty and leaves other blocks', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const firstId = section.blocks.blocks[0].id
    section.handleEnter(new BlockOffset(firstId, 0))
    expect(section.blocks.blocks.length).toBe(2)
    const secondId = section.blocks.blocks[1].id

    section.clearFirstBlock()

    expect(section.blocks.blocks.length).toBe(2)
    expect(section.blocks.getBlock(firstId).getText().text).toBe('')
    expect(section.blocks.getBlock(secondId)).toBeTruthy() // second block untouched
  })

  it('clearFirstBlock() undo restores original blocks', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section, history } = makeSection('2024-01-15', contentEl)

    const firstId = section.blocks.blocks[0].id
    section.handleEnter(new BlockOffset(firstId, 0))
    const blocksBefore = section.blocks

    section.clearFirstBlock()
    history.undo()

    expect(section.blocks).toBe(blocksBefore)
  })

  // ─── clearToEmpty() ──────────────────────────────────────────────────────────

  it('clearToEmpty() replaces all blocks with a single empty text block', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    section.handleEnter(new BlockOffset(section.blocks.blocks[0].id, 0))
    expect(section.blocks.blocks.length).toBe(2)

    section.clearToEmpty()

    expect(section.blocks.blocks.length).toBe(1)
    expect(section.blocks.blocks[0].getText().text).toBe('')
  })

  it('clearToEmpty() re-renders into DOM', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    section.handleEnter(new BlockOffset(section.blocks.blocks[0].id, 0))
    section.clearToEmpty()

    expect(contentEl.querySelectorAll('.block').length).toBe(1)
  })

  it('clearToEmpty() undo restores original blocks', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section, history } = makeSection('2024-01-15', contentEl)

    section.handleEnter(new BlockOffset(section.blocks.blocks[0].id, 0))
    const blocksBefore = section.blocks

    section.clearToEmpty()
    expect(section.blocks.blocks.length).toBe(1)

    history.undo()
    expect(section.blocks).toBe(blocksBefore)
  })

  // ─── mergeIntoLastBlock() ────────────────────────────────────────────────────

  it('mergeIntoLastBlock() appends text to the last block', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('hello', []))]))
    const lastId = section.blocks.lastBlock().id

    section.mergeIntoLastBlock(new Text(' world', []), null)

    expect(section.blocks.getBlock(lastId).getText().text).toBe('hello world')
  })

  it('mergeIntoLastBlock() returns cursor at join point (length of original last text)', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('abc', []))]))
    const lastId = section.blocks.lastBlock().id

    const cursor = section.mergeIntoLastBlock(new Text('def', []), null)

    expect(cursor.blockId).toBe(lastId)
    expect(cursor.offset).toBe(3)
  })

  it('mergeIntoLastBlock() undo restores original blocks', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section, history } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('hello', []))]))
    const blocksBefore = section.blocks

    section.mergeIntoLastBlock(new Text(' world', []), null)
    expect(section.blocks.lastBlock().getText().text).toBe('hello world')

    history.undo()
    expect(section.blocks).toBe(blocksBefore)
  })

  // ─── trimFromEnd() ───────────────────────────────────────────────────────────

  it('trimFromEnd() removes content from start offset to end of day', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    // Load two blocks: "hello" and "world"
    const block1 = Blocks.createTextBlock(new Text('hello', []))
    const block2 = Blocks.createTextBlock(new Text('world', []))
    section.load(Blocks.from([block1, block2]))

    // Trim from offset 2 of block1 (after "he") to end
    section.trimFromEnd(new BlockOffset(block1.id, 2), null)

    expect(section.blocks.blocks.length).toBe(1)
    expect(section.blocks.blocks[0].getText().text).toBe('he')
  })

  it('trimFromEnd() is a no-op when start is already at end of day', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('hello', []))]))
    const blocksBefore = section.blocks
    const lastBlock = section.blocks.lastBlock()

    section.trimFromEnd(new BlockOffset(lastBlock.id, lastBlock.getLength()), null)

    expect(section.blocks).toBe(blocksBefore)
  })

  it('trimFromEnd() undo restores original blocks', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section, history } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('hello', []))]))
    const blocksBefore = section.blocks

    section.trimFromEnd(new BlockOffset(section.blocks.blocks[0].id, 2), null)
    history.undo()

    expect(section.blocks).toBe(blocksBefore)
  })

  // ─── trimFromStart() ─────────────────────────────────────────────────────────

  it('trimFromStart() removes content from start of day to end offset', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    const block1 = Blocks.createTextBlock(new Text('hello', []))
    const block2 = Blocks.createTextBlock(new Text('world', []))
    section.load(Blocks.from([block1, block2]))

    // Trim from start to offset 2 of block2 (removes "helloXXwo" where X is block boundary)
    section.trimFromStart(new BlockOffset(block2.id, 2))

    expect(section.blocks.blocks.length).toBe(1)
    expect(section.blocks.blocks[0].getText().text).toBe('rld')
  })

  it('trimFromStart() is a no-op when end is offset 0 on the first block', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('hello', []))]))
    const blocksBefore = section.blocks
    const firstId = section.blocks.blocks[0].id

    section.trimFromStart(new BlockOffset(firstId, 0))

    expect(section.blocks).toBe(blocksBefore)
  })

  it('trimFromStart() undo restores original blocks', () => {
    const contentEl = makeContentEl()
    contentEls.push(contentEl)
    const { section, history } = makeSection('2024-01-15', contentEl)

    section.load(Blocks.from([Blocks.createTextBlock(new Text('hello', []))]))
    const blocksBefore = section.blocks

    section.trimFromStart(new BlockOffset(section.blocks.blocks[0].id, 3))
    history.undo()

    expect(section.blocks).toBe(blocksBefore)
  })
})
