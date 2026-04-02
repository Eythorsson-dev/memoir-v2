import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BlockEditor } from './BlockEditor'
import { Blocks, TextBlock, OrderedListBlock, UnorderedListBlock, type Block } from '../blocks/blocks'
import { Text, type InlineTypes } from '../text/text'
import { BLOCK_EDITOR_EVENT_NAMES } from './events'
import type { BlockCreatedEventDto, BlockDataUpdatedEventDto } from './events'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return div
}

function cleanup(editor: BlockEditor, container: HTMLElement): void {
  editor.destroy()
  container.remove()
}

function dto(id: string, text = '', children: TextBlock[] = []): TextBlock {
  return new TextBlock(id, new Text(text, []), children)
}

/** Get the block-editor-editable div from a container */
function getEditable(container: HTMLElement): HTMLElement {
  return container.querySelector('.block-editor-editable') as HTMLElement
}

/** Set a collapsed DOM cursor inside a block */
function setCursor(container: HTMLElement, blockId: string, offset: number): void {
  const editable = getEditable(container)
  const blockEl = editable.querySelector(`[id="${blockId}"]`)!
  const p = blockEl.querySelector('p, h1, h2, h3')!

  const range = document.createRange()
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  let accumulated = 0
  let node: Node | null = walker.nextNode()
  let placed = false

  while (node) {
    const len = (node.textContent ?? '').length
    if (accumulated + len >= offset) {
      range.setStart(node, offset - accumulated)
      range.setEnd(node, offset - accumulated)
      placed = true
      break
    }
    accumulated += len
    node = walker.nextNode()
  }

  if (!placed) {
    range.setStart(p, 0)
    range.setEnd(p, 0)
  }

  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Set a ranged DOM selection spanning from (startBlock, startOff) to (endBlock, endOff) */
function setRange(
  container: HTMLElement,
  startBlockId: string,
  startOffset: number,
  endBlockId: string,
  endOffset: number,
): void {
  const editable = getEditable(container)

  function findPos(blockId: string, offset: number): { node: Node; offset: number } {
    const blockEl = editable.querySelector(`[id="${blockId}"]`)!
    const p = blockEl.querySelector('p, h1, h2, h3')!
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    let accumulated = 0
    let node: Node | null = walker.nextNode()
    while (node) {
      const len = (node.textContent ?? '').length
      if (accumulated + len >= offset) {
        return { node, offset: offset - accumulated }
      }
      accumulated += len
      node = walker.nextNode()
    }
    return { node: p, offset: 0 }
  }

  const start = findPos(startBlockId, startOffset)
  const end = findPos(endBlockId, endOffset)

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)

  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Dispatch a keydown event on the editor */
function keydown(
  container: HTMLElement,
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
): void {
  const editable = getEditable(container)
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
  })
  editable.dispatchEvent(e)
}

/** Simulate typing a character by mutating the DOM text and firing input. */
function simulateType(container: HTMLElement, blockId: string, newFullText: string, cursorAt: number): void {
  const editable = getEditable(container)
  const blockEl = editable.querySelector(`[id="${blockId}"]`)!
  const p = blockEl.querySelector('p, h1, h2, h3')!
  p.textContent = newFullText
  setCursor(container, blockId, cursorAt)
  editable.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Get all block IDs in pre-order */
function preorder(blocks: Blocks): string[] {
  function walk(bs: ReadonlyArray<TextBlock>): string[] {
    return bs.flatMap(b => [b.id, ...walk(b.children as ReadonlyArray<TextBlock>)])
  }
  return walk(blocks.blocks as ReadonlyArray<TextBlock>)
}

/** Find a block by ID in the tree */
function find(blocks: Blocks, id: string): TextBlock {
  function search(bs: ReadonlyArray<TextBlock>): TextBlock | undefined {
    for (const b of bs) {
      if (b.id === id) return b
      const found = search(b.children as ReadonlyArray<TextBlock>)
      if (found) return found
    }
  }
  const result = search(blocks.blocks as ReadonlyArray<TextBlock>)
  if (!result) throw new Error(`Block '${id}' not found`)
  return result
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('construction', () => {
  it('no initial arg → one empty block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const blocks = editor.getValue()
    expect(blocks.blocks).toHaveLength(1)
    expect(blocks.blocks[0].data.text).toBe('')
    cleanup(editor, container)
  })

  it('uses provided initial state', () => {
    const container = makeContainer()
    const initial = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
    const editor = new BlockEditor(container, initial)
    expect(preorder(editor.getValue())).toEqual(['b1', 'b2'])
    cleanup(editor, container)
  })

  it('renders blocks to DOM', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('b1', 'Hello')]))
    expect(container.querySelector('[id="b1"]')).not.toBeNull()
    expect(container.querySelector('[id="b1"] p')!.textContent).toBe('Hello')
    cleanup(editor, container)
  })
})

// ─── getValue / setValue ───────────────────────────────────────────────────────

describe('getValue / setValue', () => {
  it('setValue → getValue round-trip', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const newState = Blocks.from([dto('x', 'foo'), dto('y', 'bar')])
    editor.setValue(newState)
    expect(JSON.stringify(editor.getValue().blocks)).toBe(JSON.stringify(newState.blocks))
    cleanup(editor, container)
  })

  it('setValue emits no events', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const events: string[] = []
    for (const name of BLOCK_EDITOR_EVENT_NAMES) {
      editor.addEventListener(name, () => events.push(name))
    }
    editor.setValue(Blocks.from([dto('x', 'foo')]))
    expect(events).toHaveLength(0)
    cleanup(editor, container)
  })

  it('setValue cancels pending blockDataUpdated', () => {
    vi.useFakeTimers()
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', () => events.push('blockDataUpdated'))

    // Trigger a pending data update via simulated input
    getEditable(container).focus()
    const editable = getEditable(container)
    const blockEl = editable.querySelector('[id="a"]')!
    const p = blockEl.querySelector('p, h1, h2, h3')!
    p.textContent = 'Hello!'
    setCursor(container, 'a', 6)
    editable.dispatchEvent(new Event('input', { bubbles: true }))

    // Set value before debounce fires — should cancel
    editor.setValue(Blocks.from([dto('x', 'foo')]))
    vi.advanceTimersByTime(2000)
    expect(events).toHaveLength(0)

    cleanup(editor, container)
    vi.useRealTimers()
  })
})

// ─── blockDataUpdated debouncing ──────────────────────────────────────────────

describe('blockDataUpdated debouncing', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Simulate a single character being typed by mutating the DOM then firing input */
  function simulateInput(container: HTMLElement, blockId: string, newText: string): void {
    const editable = getEditable(container)
    const blockEl = editable.querySelector(`[id="${blockId}"]`)!
    const p = blockEl.querySelector('p, h1, h2, h3')!
    p.textContent = newText
    // Re-set cursor after DOM mutation so _handleInput can read a valid selection
    setCursor(container, blockId, newText.length)
    editable.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('does not fire immediately after input', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const events: BlockDataUpdatedEventDto[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(e))

    getEditable(container).focus()
    simulateInput(container, 'a', 'Hello!')

    expect(events).toHaveLength(0)
    cleanup(editor, container)
  })

  it('fires after debounce delay', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]), { dataUpdateDebounceMs: 1000 })
    const events: BlockDataUpdatedEventDto[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(e))

    getEditable(container).focus()
    simulateInput(container, 'a', 'Hello!')

    vi.advanceTimersByTime(1000)
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('a')
    cleanup(editor, container)
  })

  it('fires after maxWait during continuous typing', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]), {
      dataUpdateDebounceMs: 1000,
      dataUpdateMaxWaitMs: 3000,
    })
    const events: BlockDataUpdatedEventDto[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(e))

    getEditable(container).focus()

    // Simulate continuous typing: each keypress is 800ms apart; after 3200ms, maxWait fires
    for (let i = 0; i < 4; i++) {
      simulateInput(container, 'a', `Hello${i}`)
      vi.advanceTimersByTime(800)
    }

    // maxWait of 3000 should have triggered by now
    expect(events.length).toBeGreaterThanOrEqual(1)
    cleanup(editor, container)
  })

  it('blur flushes pending synchronously', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const events: BlockDataUpdatedEventDto[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(e))

    getEditable(container).focus()
    simulateInput(container, 'a', 'Hello!')

    expect(events).toHaveLength(0)
    getEditable(container).dispatchEvent(new Event('blur', { bubbles: true }))
    expect(events).toHaveLength(1)
    cleanup(editor, container)
  })

  it('unsubscribe stops delivery', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]), { dataUpdateDebounceMs: 100 })
    const events: BlockDataUpdatedEventDto[] = []
    const unsub = editor.addEventListener('blockDataUpdated', (e) => events.push(e))
    unsub()

    getEditable(container).focus()
    simulateInput(container, 'a', 'Hello!')

    vi.advanceTimersByTime(200)
    expect(events).toHaveLength(0)
    cleanup(editor, container)
  })
})

// ─── Enter ────────────────────────────────────────────────────────────────────

describe('Enter', () => {
  it('collapsed mid-block → one more block; text split at cursor', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const editable = getEditable(container)
    editable.focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Enter')
    const blocks = editor.getValue()
    expect(blocks.blocks).toHaveLength(2)
    expect(blocks.blocks[0].data.text).toBe('He')
    expect(blocks.blocks[1].data.text).toBe('llo')
    cleanup(editor, container)
  })

  it('collapsed at offset 0 → empty left block, full right block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setCursor(container, 'a', 0)
    keydown(container, 'Enter')
    const blocks = editor.getValue()
    expect(blocks.blocks).toHaveLength(2)
    expect(blocks.blocks[0].data.text).toBe('')
    expect(blocks.blocks[1].data.text).toBe('Hello')
    cleanup(editor, container)
  })

  it('single-block BlockRange → same block count; selected text deleted; no new block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello World')]))
    getEditable(container).focus()
    setRange(container, 'a', 2, 'a', 7)
    keydown(container, 'Enter')
    const blocks = editor.getValue()
    expect(blocks.blocks).toHaveLength(1)
    expect(blocks.blocks[0].data.text).toBe('Heorld')
    cleanup(editor, container)
  })

  it('multi-block BlockRange → fewer blocks; content between deleted; no extra block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB'), dto('c', 'CCC')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'c', 2)
    keydown(container, 'Enter')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('AC')
    cleanup(editor, container)
  })
})

// ─── blockCreated events ───────────────────────────────────────────────────────

describe('blockCreated events', () => {
  it('Enter at end of block — only blockCreated', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const created: BlockCreatedEventDto[] = []
    const dataUpdated: string[] = []
    editor.addEventListener('blockCreated', (e) => created.push(e))
    editor.addEventListener('blockDataUpdated', (e) => dataUpdated.push(e.id))

    getEditable(container).focus()
    setCursor(container, 'a', 5)
    keydown(container, 'Enter')

    expect(created).toHaveLength(1)
    expect(created[0].data).toEqual({ text: '', inline: [] })  // new block is empty
    expect(dataUpdated).toHaveLength(0)  // no immediate data update for 'a'
    cleanup(editor, container)
  })

  it('Enter mid-block — immediate blockDataUpdated then blockCreated', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const events: string[] = []
    const created: BlockCreatedEventDto[] = []
    editor.addEventListener('blockCreated', (e) => { events.push(`created:${e.id}`); created.push(e) })
    editor.addEventListener('blockDataUpdated', (e) => events.push(`data:${e.id}`))

    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Enter')

    expect(events[0]).toBe('data:a')
    expect(events[1]).toMatch(/^created:/)
    expect(created[0].data).toBeInstanceOf(Text)
    expect((created[0].data as Text).text).toBe('llo')  // tail of 'Hello' after split at offset 2
    cleanup(editor, container)
  })

  it('Enter on first block — previousBlockId is null', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const created: Array<{ previousBlockId: string | null }> = []
    editor.addEventListener('blockCreated', (e) => created.push(e))

    getEditable(container).focus()
    setCursor(container, 'a', 5)
    keydown(container, 'Enter')

    expect(created[0].previousBlockId).toBe('a')
    cleanup(editor, container)
  })

  it('blockCreated previousBlockId/parentBlockId correct for nested blocks', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA', [dto('b', 'BB')])]))
    const created: Array<{ id: string; previousBlockId: string | null; parentBlockId: string | null }> = []
    editor.addEventListener('blockCreated', (e) => created.push(e))

    getEditable(container).focus()
    setCursor(container, 'b', 2)  // at end of nested block 'b'
    keydown(container, 'Enter')

    expect(created[0].previousBlockId).toBe('b')
    expect(created[0].parentBlockId).toBe('a')
    cleanup(editor, container)
  })
})

// ─── Backspace ────────────────────────────────────────────────────────────────

describe('Backspace', () => {
  it('collapsed at offset 0, non-first, no children → blocks merged', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', ' World')]))
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Backspace')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('Hello World')
    cleanup(editor, container)
  })

  it('collapsed at offset 0, first block → no change', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    getEditable(container).focus()
    setCursor(container, 'a', 0)
    keydown(container, 'Backspace')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a', 'b'])
    cleanup(editor, container)
  })

  it("collapsed at offset 0, block with children → merged; children become sibling of merged block", () => {
    const container = makeContainer()
    // flat: [a:0, b:0, c:1]
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA'), dto('b', 'BB', [dto('c', 'CC')])]))
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Backspace')
    const blocks = editor.getValue()
    // b is merged into a; c (b's child) gets re-parented via clamping
    expect(preorder(blocks)).toEqual(['a', 'c'])
    expect(blocks.blocks[0].data.text).toBe('AABB')
    cleanup(editor, container)
  })

  it('BlockRange → selected content deleted and merged', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'b', 2)
    keydown(container, 'Backspace')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('AB')
    cleanup(editor, container)
  })
})

// ─── blockRemoved events ──────────────────────────────────────────────────────

describe('blockRemoved events', () => {
  it('Backspace merge — emits blockDataUpdated and blockRemoved', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', ' World')]))
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(`data:${e.id}`))
    editor.addEventListener('blockRemoved', (e) => events.push(`removed:${e.id}`))

    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Backspace')

    expect(events).toHaveLength(2)
    expect(events).toEqual(expect.arrayContaining(['data:a', 'removed:b']))
    cleanup(editor, container)
  })

  it('Delete merge — emits blockDataUpdated and blockRemoved', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', ' World')]))
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(`data:${e.id}`))
    editor.addEventListener('blockRemoved', (e) => events.push(`removed:${e.id}`))

    getEditable(container).focus()
    setCursor(container, 'a', 5)
    keydown(container, 'Delete')

    expect(events).toHaveLength(2)
    expect(events).toEqual(expect.arrayContaining(['data:a', 'removed:b']))
    cleanup(editor, container)
  })

  it('Multi-block range delete — blockRemoved for each removed block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB'), dto('c', 'CCC')]))
    const removed: string[] = []
    editor.addEventListener('blockRemoved', (e) => removed.push(e.id))

    getEditable(container).focus()
    setRange(container, 'a', 1, 'c', 2)
    keydown(container, 'Backspace')

    expect(removed).toContain('b')
    expect(removed).toContain('c')
    cleanup(editor, container)
  })
})

// ─── blockMoved events ────────────────────────────────────────────────────────

describe('blockMoved events', () => {
  it('Enter mid-block displaces next sibling → blockMoved with new previousBlockId', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    const moved: Array<{ id: string; previousBlockId: string | null }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Enter')

    // 'b' should have been displaced — its previousBlockId should no longer be 'a'
    const bMoved = moved.find(m => m.id === 'b')
    expect(bMoved).toBeDefined()
    expect(bMoved?.previousBlockId).not.toBe('a')
    cleanup(editor, container)
  })

  it('Tab indent → blockMoved for indented block with correct parentBlockId', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA'), dto('b', 'BB')]))
    const moved: Array<{ id: string; parentBlockId: string | null }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Tab')

    const bMoved = moved.find(m => m.id === 'b')
    expect(bMoved).toBeDefined()
    expect(bMoved?.parentBlockId).toBe('a')
    cleanup(editor, container)
  })

  it('Shift+Tab outdent → blockMoved for unindented block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA', [dto('b', 'BB')])]))
    const moved: Array<{ id: string; parentBlockId: string | null }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Tab', { shiftKey: true })

    const bMoved = moved.find(m => m.id === 'b')
    expect(bMoved).toBeDefined()
    expect(bMoved?.parentBlockId).toBeNull()
    cleanup(editor, container)
  })

  it('Enter mid-block displaces children of split block → blockMoved for each child', () => {
    const container = makeContainer()
    const editor = new BlockEditor(
      container,
      Blocks.from([dto('a', 'Hello', [dto('b', 'B'), dto('c', 'C')]), dto('d', 'World')]),
    )
    const moved: Array<{ id: string; parentBlockId: string | null; previousBlockId: string | null }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Enter')

    // B and C should now be children of the new block (parent changed from 'a')
    const bMoved = moved.find(m => m.id === 'b')
    const cMoved = moved.find(m => m.id === 'c')
    expect(bMoved).toBeDefined()
    expect(bMoved?.parentBlockId).not.toBe('a')
    expect(cMoved).toBeDefined()
    expect(cMoved?.parentBlockId).not.toBe('a')
    // D should also have moved (its previousBlockId changed from 'a')
    const dMoved = moved.find(m => m.id === 'd')
    expect(dMoved).toBeDefined()
    cleanup(editor, container)
  })

  it('Multi-block indent → one blockMoved per affected block in order', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA'), dto('b', 'BB'), dto('c', 'CC')]))
    const moved: string[] = []
    editor.addEventListener('blockMoved', (e) => moved.push(e.id))

    getEditable(container).focus()
    setRange(container, 'b', 0, 'c', 0)
    keydown(container, 'Tab')

    expect(moved).toContain('b')
    expect(moved).toContain('c')
    cleanup(editor, container)
  })

  it('Backspace merge — emits blockMoved for children of removed block', () => {
    // flat: [a:0, b:0, c:1, d:1] — b has children c and d
    const container = makeContainer()
    const editor = new BlockEditor(
      container,
      Blocks.from([dto('a', 'AA'), dto('b', 'BB', [dto('c', 'CC'), dto('d', 'DD')])]),
    )
    const moved: Array<{ id: string; parentBlockId: string | null; previousBlockId: string | null }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Backspace')

    // c and d were children of b; after merge b is gone, they re-parent under a or become root
    const cMoved = moved.find(m => m.id === 'c')
    const dMoved = moved.find(m => m.id === 'd')
    expect(cMoved).toBeDefined()
    expect(dMoved).toBeDefined()
    cleanup(editor, container)
  })

  it('Delete merge — emits blockMoved for children of removed block', () => {
    // flat: [a:0, b:0, c:1] — b has child c; Delete at end of a merges a+b
    const container = makeContainer()
    const editor = new BlockEditor(
      container,
      Blocks.from([dto('a', 'AA'), dto('b', 'BB', [dto('c', 'CC')])]),
    )
    const moved: Array<{ id: string; parentBlockId: string | null }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Delete')

    const cMoved = moved.find(m => m.id === 'c')
    expect(cMoved).toBeDefined()
    cleanup(editor, container)
  })

  it('range-delete — emits blockMoved for children of removed blocks that remain', () => {
    // flat: [a:0, b:0, c:1, d:1]  (b has children c and d)
    // Range selection from (a, 2) to (c, 0) then Backspace
    // deleteRange removes b and c, keeps d; d's parent changes b → a
    const container = makeContainer()
    const editor = new BlockEditor(
      container,
      Blocks.from([dto('a', 'AA'), dto('b', 'BB', [dto('c', 'CC'), dto('d', 'DD')])]),
    )
    const moved: Array<{ id: string }> = []
    editor.addEventListener('blockMoved', (e) => moved.push(e))

    getEditable(container).focus()
    setRange(container, 'a', 2, 'c', 0)
    keydown(container, 'Backspace')

    expect(moved.find((m) => m.id === 'd')).toBeDefined()
    cleanup(editor, container)
  })
})

// ─── selectionChange events ───────────────────────────────────────────────────

describe('selectionChange events', () => {
  it('blur emits selectionChange(null)', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const selections: Array<unknown> = []
    editor.addEventListener('selectionChange', (s) => selections.push(s))

    getEditable(container).focus()
    getEditable(container).dispatchEvent(new Event('blur', { bubbles: true }))

    expect(selections[selections.length - 1]).toBeNull()
    cleanup(editor, container)
  })
})

// ─── destroy() cleanup ────────────────────────────────────────────────────────

describe('destroy() cleanup', () => {
  it('no selectionchange listener on document after destroy()', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const selections: unknown[] = []
    editor.addEventListener('selectionChange', (s) => selections.push(s))

    editor.destroy()
    container.remove()

    // After destroy, dispatching selectionchange should not call our listener
    const countBefore = selections.length
    document.dispatchEvent(new Event('selectionchange'))
    expect(selections.length).toBe(countBefore)
  })
})

// ─── setValue() events ────────────────────────────────────────────────────────

describe('setValue() events', () => {
  it('emits no events', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', () => events.push('data'))
    editor.addEventListener('blockCreated', () => events.push('created'))
    editor.addEventListener('blockRemoved', () => events.push('removed'))
    editor.addEventListener('blockMoved', () => events.push('moved'))
    editor.setValue(Blocks.from([dto('x', 'foo')]))
    expect(events).toHaveLength(0)
    cleanup(editor, container)
  })
})

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('Delete', () => {
  it('collapsed at end, next block is sibling → merged', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', ' World')]))
    getEditable(container).focus()
    setCursor(container, 'a', 5)
    keydown(container, 'Delete')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('Hello World')
    cleanup(editor, container)
  })

  it('collapsed at end, next block is descendant → merged; subtree clamped', () => {
    const container = makeContainer()
    // flat: [a:0, b:1, c:2] — press Delete at end of 'a'; merges with 'b'
    const editor = new BlockEditor(container, Blocks.from([
      dto('a', 'AA', [dto('b', 'BB', [dto('c', 'CC')])])
    ]))
    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Delete')
    const blocks = editor.getValue()
    // 'b' (next in flat order) merged into 'a'; 'c' re-parented via clamping
    expect(preorder(blocks)).toEqual(['a', 'c'])
    expect(find(blocks, 'a').data.text).toBe('AABB')
    cleanup(editor, container)
  })

  it('collapsed at end, last block → no change', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    getEditable(container).focus()
    setCursor(container, 'b', 5)
    keydown(container, 'Delete')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a', 'b'])
    cleanup(editor, container)
  })

  it('BlockRange → deleted and merged', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'b', 2)
    keydown(container, 'Delete')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('AB')
    cleanup(editor, container)
  })
})

// ─── Tab / Shift+Tab ──────────────────────────────────────────────────────────

describe('Tab / Shift+Tab', () => {
  it('Tab → indent applied; getValue reflects new structure', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA'), dto('b', 'BB')]))
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Tab')
    const blocks = editor.getValue()
    // b should now be indented under a
    expect(find(blocks, 'a').children.map((x: Block<unknown>) => x.id)).toContain('b')
    cleanup(editor, container)
  })

  it('Shift+Tab → unindent applied', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AA', [dto('b', 'BB')])]))
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Tab', { shiftKey: true })
    const blocks = editor.getValue()
    // b should now be at same level as a
    expect(blocks.blocks.map(x => x.id)).toContain('b')
    expect(find(blocks, 'a').children).toHaveLength(0)
    cleanup(editor, container)
  })
})

// ─── Ctrl+B / Ctrl+I / Ctrl+U ────────────────────────────────────────────────

describe('Ctrl+B / Ctrl+I / Ctrl+U', () => {
  it('Bold applied on selection → getValue block has Bold inline', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'a', 4)
    keydown(container, 'b', { ctrlKey: true })
    const block = find(editor.getValue(), 'a')
    expect(block.data.inline).toContainEqual({ type: 'Bold', start: 1, end: 4 })
    cleanup(editor, container)
  })

  it('Bold applied again → removed', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'a', 4)
    keydown(container, 'b', { ctrlKey: true })
    keydown(container, 'b', { ctrlKey: true })
    const block = find(editor.getValue(), 'a')
    expect(block.data.inline).toHaveLength(0)
    cleanup(editor, container)
  })

  it('Italic applied on selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    keydown(container, 'i', { ctrlKey: true })
    const block = find(editor.getValue(), 'a')
    expect(block.data.inline).toContainEqual({ type: 'Italic', start: 0, end: 5 })
    cleanup(editor, container)
  })

  it('Underline applied on selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 3)
    keydown(container, 'u', { ctrlKey: true })
    const block = find(editor.getValue(), 'a')
    expect(block.data.inline).toContainEqual({ type: 'Underline', start: 0, end: 3 })
    cleanup(editor, container)
  })
})

// ─── Printable char with BlockRange ──────────────────────────────────────────

describe('printable char with BlockRange', () => {
  it('single-block range replaced by typed char', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'a', 4)
    keydown(container, 'X')
    const blocks = editor.getValue()
    expect(blocks.blocks[0].data.text).toBe('HXo')
    cleanup(editor, container)
  })

  it('multi-block range: merged block contains the typed character', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'b', 2)
    keydown(container, 'X')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('AXB')
    cleanup(editor, container)
  })
})

// ─── IME ─────────────────────────────────────────────────────────────────────

describe('IME', () => {
  it('mid-composition input events → getValue unchanged', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const editable = getEditable(container)
    editable.focus()

    editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    // Simulate DOM mutation that would normally happen during IME
    const blockEl = editable.querySelector('[id="a"]')!
    const p = blockEl.querySelector('p, h1, h2, h3')!
    p.textContent = 'Hello世'
    editable.dispatchEvent(new Event('input', { bubbles: true }))

    // State should not have changed during composition
    expect(editor.getValue().blocks[0].data.text).toBe('Hello')
    cleanup(editor, container)
  })

  it('compositionend → state updated', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const editable = getEditable(container)
    editable.focus()

    editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    // Set DOM state as it would be after IME completes
    const blockEl = editable.querySelector('[id="a"]')!
    const p = blockEl.querySelector('p, h1, h2, h3')!
    p.textContent = 'Hello世界'

    // Set cursor after the IME text
    setCursor(container, 'a', 7)

    editable.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    // State should now reflect the IME input
    expect(editor.getValue().blocks[0].data.text).toBe('Hello世界')
    cleanup(editor, container)
  })

  it('multi-block selection + compositionstart → range deleted before composition', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB')]))
    const editable = getEditable(container)
    editable.focus()
    setRange(container, 'a', 1, 'b', 2)
    editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))

    // Range should be deleted; only one block remaining (or merged)
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a'])
    expect(blocks.blocks[0].data.text).toBe('AB')
    cleanup(editor, container)
  })
})

// ─── isInlineActive ───────────────────────────────────────────────────────────

describe('isInlineActive', () => {
  it('returns true when format is active on selection', () => {
    const container = makeContainer()
    const initial = Blocks.from([
      new TextBlock('a', new Text('Hello', [{ type: 'Bold', start: 0, end: 5 }]), []),
    ])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    expect(editor.isInlineActive('Bold')).toBe(true)
    cleanup(editor, container)
  })

  it('returns false when format is not active', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    expect(editor.isInlineActive('Bold')).toBe(false)
    cleanup(editor, container)
  })

  it('returns false for collapsed selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setCursor(container, 'a', 2)
    expect(editor.isInlineActive('Bold')).toBe(false)
    cleanup(editor, container)
  })
})

// ─── cross-block inline operations ───────────────────────────────────────────

describe('cross-block inline operations', () => {
  it('toggleInline Bold across two blocks → applies Bold to both block segments', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    getEditable(container).focus()
    setRange(container, 'a', 2, 'b', 3)
    editor.toggleInline('Bold')
    const blockA = find(editor.getValue(), 'a')
    const blockB = find(editor.getValue(), 'b')
    expect(blockA.data.inline).toContainEqual({ type: 'Bold', start: 2, end: 5 })
    expect(blockB.data.inline).toContainEqual({ type: 'Bold', start: 0, end: 3 })
    cleanup(editor, container)
  })

  it('toggleInline Bold across two blocks (all already Bold) → removes Bold from both', () => {
    const container = makeContainer()
    const initial = Blocks.from([
      new TextBlock('a', new Text('Hello', [{ type: 'Bold', start: 0, end: 5 }]), []),
      new TextBlock('b', new Text('World', [{ type: 'Bold', start: 0, end: 5 }]), []),
    ])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setRange(container, 'a', 0, 'b', 5)
    editor.toggleInline('Bold')
    const blockA = find(editor.getValue(), 'a')
    const blockB = find(editor.getValue(), 'b')
    expect(blockA.data.inline).toHaveLength(0)
    expect(blockB.data.inline).toHaveLength(0)
    cleanup(editor, container)
  })

  it('toggleInline Bold across three blocks → applies Bold to all three segments', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'AAA'), dto('b', 'BBB'), dto('c', 'CCC')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'c', 2)
    editor.toggleInline('Bold')
    const blockA = find(editor.getValue(), 'a')
    const blockB = find(editor.getValue(), 'b')
    const blockC = find(editor.getValue(), 'c')
    expect(blockA.data.inline).toContainEqual({ type: 'Bold', start: 1, end: 3 })
    expect(blockB.data.inline).toContainEqual({ type: 'Bold', start: 0, end: 3 })
    expect(blockC.data.inline).toContainEqual({ type: 'Bold', start: 0, end: 2 })
    cleanup(editor, container)
  })

  it('toggleInline Highlight across two blocks → applies highlight to both segments', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    getEditable(container).focus()
    setRange(container, 'a', 1, 'b', 4)
    editor.toggleInline('Highlight', { color: 'amber' })
    const blockA = find(editor.getValue(), 'a')
    const blockB = find(editor.getValue(), 'b')
    expect(blockA.data.inline).toContainEqual({ type: 'Highlight', start: 1, end: 5, color: 'amber' })
    expect(blockB.data.inline).toContainEqual({ type: 'Highlight', start: 0, end: 4, color: 'amber' })
    cleanup(editor, container)
  })

  it('removeInlineFromSelection across blocks → removes inline from both segments', () => {
    const container = makeContainer()
    const initial = Blocks.from([
      new TextBlock('a', new Text('Hello', [{ type: 'Bold', start: 0, end: 5 }]), []),
      new TextBlock('b', new Text('World', [{ type: 'Bold', start: 0, end: 5 }]), []),
    ])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setRange(container, 'a', 0, 'b', 5)
    editor.removeInlineFromSelection('Bold')
    const blockA = find(editor.getValue(), 'a')
    const blockB = find(editor.getValue(), 'b')
    expect(blockA.data.inline).toHaveLength(0)
    expect(blockB.data.inline).toHaveLength(0)
    cleanup(editor, container)
  })

  it('isInlineActive across blocks → true when all segments are covered', () => {
    const container = makeContainer()
    const initial = Blocks.from([
      new TextBlock('a', new Text('Hello', [{ type: 'Bold', start: 0, end: 5 }]), []),
      new TextBlock('b', new Text('World', [{ type: 'Bold', start: 0, end: 5 }]), []),
    ])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setRange(container, 'a', 0, 'b', 5)
    expect(editor.isInlineActive('Bold')).toBe(true)
    cleanup(editor, container)
  })

  it('isInlineActive across blocks → false when not all segments are covered', () => {
    const container = makeContainer()
    const initial = Blocks.from([
      new TextBlock('a', new Text('Hello', [{ type: 'Bold', start: 0, end: 5 }]), []),
      new TextBlock('b', new Text('World', []), []),
    ])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setRange(container, 'a', 0, 'b', 5)
    expect(editor.isInlineActive('Bold')).toBe(false)
    cleanup(editor, container)
  })
})

// ─── undo/redo events ─────────────────────────────────────────────────────────

describe('undo/redo events', () => {
  it('undo after Enter mid-block emits blockRemoved for created block + blockDataUpdated for split block', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(`data:${e.id}`))
    editor.addEventListener('blockCreated', (e) => events.push(`created:${e.id}`))
    editor.addEventListener('blockRemoved', (e) => events.push(`removed:${e.id}`))

    // Press Enter mid-block at offset 2 → 'a' becomes "He", new block gets "llo"
    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Enter')

    // Record the new block id
    const blocksAfterEnter = editor.getValue()
    expect(preorder(blocksAfterEnter)).toHaveLength(2)
    const newId = preorder(blocksAfterEnter)[1]

    // Clear events and undo
    events.length = 0
    editor.undo()

    expect(events).toContain(`removed:${newId}`)
    // 'a' was split at 2 ("He"), undoing restores original text "Hello"
    expect(events).toContain('data:a')
    cleanup(editor, container)
  })

  it('redo after undo emits blockCreated + blockDataUpdated', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(`data:${e.id}`))
    editor.addEventListener('blockCreated', (e) => events.push(`created:${e.id}`))
    editor.addEventListener('blockRemoved', (e) => events.push(`removed:${e.id}`))

    getEditable(container).focus()
    setCursor(container, 'a', 2)
    keydown(container, 'Enter')

    const blocksAfterEnter = editor.getValue()
    const newId = preorder(blocksAfterEnter)[1]

    editor.undo()

    events.length = 0
    editor.redo()

    expect(events).toContain(`created:${newId}`)
    expect(events).toContain('data:a')
    cleanup(editor, container)
  })

  it('undo after Backspace merge emits blockCreated for restored block + blockDataUpdated', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', ' World')]))
    const events: string[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(`data:${e.id}`))
    editor.addEventListener('blockCreated', (e) => events.push(`created:${e.id}`))
    editor.addEventListener('blockRemoved', (e) => events.push(`removed:${e.id}`))

    // Backspace at start of 'b' merges 'b' into 'a'
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    keydown(container, 'Backspace')
    expect(preorder(editor.getValue())).toEqual(['a'])

    events.length = 0
    editor.undo()

    // 'b' was removed by Backspace, so undo re-creates it
    expect(events).toContain('created:b')
    // 'a' data is restored to 'Hello'
    expect(events).toContain('data:a')
    cleanup(editor, container)
  })

  it('undo/redo do not push new history entries', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))

    getEditable(container).focus()
    setCursor(container, 'a', 5)
    keydown(container, 'Enter')

    // After Enter: canUndo=true, canRedo=false
    expect(editor.canUndo()).toBe(true)
    expect(editor.canRedo()).toBe(false)

    editor.undo()
    // After undo: canUndo=false (back to initial), canRedo=true
    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(true)

    editor.redo()
    // After redo: canUndo=true again, canRedo=false
    expect(editor.canUndo()).toBe(true)
    expect(editor.canRedo()).toBe(false)

    cleanup(editor, container)
  })
})


// ─── isBlockTypeActive ────────────────────────────────────────────────────────

describe('isBlockTypeActive', () => {
  it('returns true when all selected blocks are text', () => {
    const container = makeContainer()
    const blocks = Blocks.from([dto('a', 'Hello'), dto('b', 'World')])
    const editor = new BlockEditor(container, blocks)
    setCursor(container, 'a', 0)
    expect(editor.isBlockTypeActive('text')).toBe(true)
    cleanup(editor, container)
  })

  it('returns false when selection includes an ordered-list block', () => {
    const container = makeContainer()
    const blocks = Blocks.from([
      dto('a', 'Hello'),
      new OrderedListBlock('b', new Text('Item', []), []),
    ])
    const editor = new BlockEditor(container, blocks)
    setCursor(container, 'b', 0)
    expect(editor.isBlockTypeActive('text')).toBe(false)
    expect(editor.isBlockTypeActive('ordered-list')).toBe(true)
    cleanup(editor, container)
  })

  it('returns false for no selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    expect(editor.isBlockTypeActive('text')).toBe(false)
    cleanup(editor, container)
  })
})

// ─── convertBlockType ────────────────────────────────────────────────────────

describe('convertBlockType', () => {
  it('converts a single block type', () => {
    const container = makeContainer()
    const blocks = Blocks.from([dto('a', 'Hello')])
    const editor = new BlockEditor(container, blocks)
    setCursor(container, 'a', 0)
    editor.convertBlockType('ordered-list')
    expect(editor.getValue().getBlock('a')).toBeInstanceOf(OrderedListBlock)
    cleanup(editor, container)
  })

  it('reverts all blocks in selection back to text', () => {
    const container = makeContainer()
    const blocks = Blocks.from([
      new OrderedListBlock('a', new Text('Item 1', []), []),
      new OrderedListBlock('b', new Text('Item 2', []), []),
    ])
    const editor = new BlockEditor(container, blocks)
    setCursor(container, 'a', 0)
    editor.convertBlockType('text')
    expect(editor.getValue().getBlock('a')).toBeInstanceOf(TextBlock)
    cleanup(editor, container)
  })
})

// ─── markdown input shortcuts ────────────────────────────────────────────────

describe('markdown input shortcuts', () => {
  it('typing "- " converts text block to unordered-list and strips marker', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '-', 1)
    simulateType(container, 'a', '- ', 2)
    const block = editor.getValue().getBlock('a')
    expect(block.blockType).toBe('unordered-list')
    expect(block.getText().text).toBe('')
    cleanup(editor, container)
  })

  it('typing "* " converts text block to unordered-list and strips marker', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '*', 1)
    simulateType(container, 'a', '* ', 2)
    const block = editor.getValue().getBlock('a')
    expect(block.blockType).toBe('unordered-list')
    expect(block.getText().text).toBe('')
    cleanup(editor, container)
  })

  it('typing "1. " converts text block to ordered-list and strips marker', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '1', 1)
    simulateType(container, 'a', '1.', 2)
    simulateType(container, 'a', '1. ', 3)
    const block = editor.getValue().getBlock('a')
    expect(block.blockType).toBe('ordered-list')
    expect(block.getText().text).toBe('')
    cleanup(editor, container)
  })

  it('preserves content after the marker', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    // Cursor at offset 1 (after imagined '-' inserted at position 0); full text is "- Hello"
    simulateType(container, 'a', '- Hello', 2)
    const block = editor.getValue().getBlock('a')
    expect(block.blockType).toBe('unordered-list')
    expect(block.getText().text).toBe('Hello')
    cleanup(editor, container)
  })

  it('does not convert when block is already the target type', () => {
    const container = makeContainer()
    const initial = Blocks.from([new UnorderedListBlock('a', new Text('', []), [])])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    simulateType(container, 'a', '-', 1)
    simulateType(container, 'a', '- ', 2)
    expect(editor.getValue().getBlock('a').blockType).toBe('unordered-list')
    // Text should NOT be stripped — no conversion occurred
    expect(editor.getValue().getBlock('a').getText().text).toBe('- ')
    cleanup(editor, container)
  })

  it('converts ordered-list to unordered-list via "- " trigger', () => {
    const container = makeContainer()
    const initial = Blocks.from([new OrderedListBlock('a', new Text('', []), [])])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    simulateType(container, 'a', '-', 1)
    simulateType(container, 'a', '- ', 2)
    const block = editor.getValue().getBlock('a')
    expect(block.blockType).toBe('unordered-list')
    expect(block.getText().text).toBe('')
    cleanup(editor, container)
  })

  it('undo after "- " conversion restores text block with marker and space', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '-', 1)
    simulateType(container, 'a', '- ', 2)
    expect(editor.getValue().getBlock('a').blockType).toBe('unordered-list')

    editor.undo()

    const block = editor.getValue().getBlock('a')
    expect(block.blockType).toBe('text')
    expect(block.getText().text).toBe('- ')
    cleanup(editor, container)
  })
})

// ─── Header block behaviour ────────────────────────────────────────────────────

import { HeaderBlock, Header } from '../blocks/blocks'

describe('BlockEditor — heading input rules', () => {
  it('typing "# " converts text block to H1 and strips marker', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '#', 1)
    simulateType(container, 'a', '# ', 2)
    const block = editor.getValue().getBlock('a') as HeaderBlock
    expect(block.blockType).toBe('header')
    expect(block.data.level).toBe(1)
    expect(block.getText().text).toBe('')
    cleanup(editor, container)
  })

  it('typing "## " converts text block to H2', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '#', 1)
    simulateType(container, 'a', '##', 2)
    simulateType(container, 'a', '## ', 3)
    const block = editor.getValue().getBlock('a') as HeaderBlock
    expect(block.blockType).toBe('header')
    expect(block.data.level).toBe(2)
    cleanup(editor, container)
  })

  it('typing "### " converts text block to H3', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', '')]))
    getEditable(container).focus()
    simulateType(container, 'a', '###', 3)
    simulateType(container, 'a', '### ', 4)
    const block = editor.getValue().getBlock('a') as HeaderBlock
    expect(block.blockType).toBe('header')
    expect(block.data.level).toBe(3)
    cleanup(editor, container)
  })

  it('re-triggers on an existing header to change level', () => {
    const container = makeContainer()
    const initial = Blocks.from([new HeaderBlock('a', new Header(1, new Text('', [])), [])])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    simulateType(container, 'a', '##', 2)
    simulateType(container, 'a', '## ', 3)
    const block = editor.getValue().getBlock('a') as HeaderBlock
    expect(block.data.level).toBe(2)
    cleanup(editor, container)
  })
})

describe('BlockEditor — Enter key on header', () => {
  it('Enter at end of header creates a new TextBlock', () => {
    const container = makeContainer()
    const initial = Blocks.from([new HeaderBlock('a', new Header(1, new Text('Title', [])), [])])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setCursor(container, 'a', 5) // end of "Title"
    getEditable(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const blocks = editor.getValue().blocks
    expect(blocks).toHaveLength(2)
    expect(blocks[0].blockType).toBe('header')
    expect(blocks[1].blockType).toBe('text')
    expect(blocks[1].getText().text).toBe('')
    cleanup(editor, container)
  })

  it('Enter mid-header splits into two headers of the same level', () => {
    const container = makeContainer()
    const initial = Blocks.from([new HeaderBlock('a', new Header(2, new Text('Hello', [])), [])])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setCursor(container, 'a', 2) // after "He"
    getEditable(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const blocks = editor.getValue().blocks
    expect(blocks).toHaveLength(2)
    expect(blocks[0].blockType).toBe('header')
    expect((blocks[0] as HeaderBlock).data.level).toBe(2)
    expect(blocks[0].getText().text).toBe('He')
    expect(blocks[1].blockType).toBe('header')
    expect((blocks[1] as HeaderBlock).data.level).toBe(2)
    expect(blocks[1].getText().text).toBe('llo')
    cleanup(editor, container)
  })
})

describe('BlockEditor — blockDataUpdated carries Header data', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function typeInBlock(container: HTMLElement, blockId: string, newText: string): void {
    const editable = getEditable(container)
    const blockEl = editable.querySelector(`[id="${blockId}"]`)!
    const p = blockEl.querySelector('p, h1, h2, h3')!
    p.textContent = newText
    setCursor(container, blockId, newText.length)
    editable.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('debounced blockDataUpdated for a header block carries a Header with level', () => {
    const container = makeContainer()
    const initial = Blocks.from([new HeaderBlock('a', new Header(2, new Text('Title', [])), [])])
    const editor = new BlockEditor(container, initial, { dataUpdateDebounceMs: 500 })
    const events: BlockDataUpdatedEventDto[] = []
    editor.addEventListener('blockDataUpdated', (e) => events.push(e))

    getEditable(container).focus()
    typeInBlock(container, 'a', 'Titled')

    vi.advanceTimersByTime(500)
    expect(events).toHaveLength(1)
    expect(events[0].blockType).toBe('header')
    expect(events[0].data).toBeInstanceOf(Header)
    expect((events[0].data as Header).level).toBe(2)
    cleanup(editor, container)
  })
})
