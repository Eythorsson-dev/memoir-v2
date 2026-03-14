import { describe, it, expect, beforeEach } from 'vitest'
import { BlockEditor, BlockOffset, BlockRange, BlockSelection } from './BlockEditor'
import { BlockEditorWithToolbar } from './BlockEditorWithToolbar'
import { Blocks, Block } from '../blocks/blocks'
import { Text, InlineTypes } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return div
}

function cleanup(container: HTMLElement): void {
  container.remove()
}

function dto(id: string, text = '', children: Block[] = []): Block {
  return new Block(id, { text, inline: [] }, children)
}

/** Get the block-editor-editable div from a container */
function getEditable(container: HTMLElement): HTMLElement {
  return container.querySelector('.block-editor-editable') as HTMLElement
}

/** Set a collapsed DOM cursor inside a block */
function setCursor(container: HTMLElement, blockId: string, offset: number): void {
  const editable = getEditable(container)
  const blockEl = editable.querySelector(`[id="${blockId}"]`)!
  const p = blockEl.querySelector('p')!

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
    const p = blockEl.querySelector('p')!
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

/** Get all block IDs in pre-order */
function preorder(blocks: Blocks): string[] {
  function walk(bs: ReadonlyArray<Block>): string[] {
    return bs.flatMap(b => [b.id, ...walk(b.children)])
  }
  return walk(blocks.blocks)
}

/** Find a block by ID in the tree */
function find(blocks: Blocks, id: string): Block {
  function search(bs: ReadonlyArray<Block>): Block | undefined {
    for (const b of bs) {
      if (b.id === id) return b
      const found = search(b.children)
      if (found) return found
    }
  }
  const result = search(blocks.blocks)
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
    cleanup(container)
  })

  it('uses provided initial state', () => {
    const container = makeContainer()
    const initial = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
    const editor = new BlockEditor(container, initial)
    expect(preorder(editor.getValue())).toEqual(['b1', 'b2'])
    cleanup(container)
  })

  it('renders blocks to DOM', () => {
    const container = makeContainer()
    new BlockEditor(container, Blocks.from([dto('b1', 'Hello')]))
    expect(container.querySelector('[id="b1"]')).not.toBeNull()
    expect(container.querySelector('[id="b1"] p')!.textContent).toBe('Hello')
    cleanup(container)
  })
})

// ─── getValue / setValue / onChange ───────────────────────────────────────────

describe('getValue / setValue / onChange', () => {
  it('setValue → getValue round-trip', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const newState = Blocks.from([dto('x', 'foo'), dto('y', 'bar')])
    editor.setValue(newState)
    expect(JSON.stringify(editor.getValue().blocks)).toBe(JSON.stringify(newState.blocks))
    cleanup(container)
  })

  it('onChange fires after setValue', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const calls: Blocks[] = []
    editor.onChange(b => calls.push(b))
    const newState = Blocks.from([dto('x', 'foo')])
    editor.setValue(newState)
    expect(calls).toHaveLength(1)
    expect(calls[0].blocks[0].id).toBe('x')
    cleanup(container)
  })

  it('onChange unsubscribe stops callbacks', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container)
    const calls: number[] = []
    const unsub = editor.onChange(() => calls.push(1))
    unsub()
    editor.setValue(Blocks.from([dto('x', 'foo')]))
    expect(calls).toHaveLength(0)
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
  })

  it('collapsed at offset 0, first block → no change', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    getEditable(container).focus()
    setCursor(container, 'a', 0)
    keydown(container, 'Backspace')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a', 'b'])
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
  })

  it('collapsed at end, last block → no change', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello'), dto('b', 'World')]))
    getEditable(container).focus()
    setCursor(container, 'b', 5)
    keydown(container, 'Delete')
    const blocks = editor.getValue()
    expect(preorder(blocks)).toEqual(['a', 'b'])
    cleanup(container)
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
    cleanup(container)
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
    expect(find(blocks, 'a').children.map(x => x.id)).toContain('b')
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
  })

  it('Italic applied on selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    keydown(container, 'i', { ctrlKey: true })
    const block = find(editor.getValue(), 'a')
    expect(block.data.inline).toContainEqual({ type: 'Italic', start: 0, end: 5 })
    cleanup(container)
  })

  it('Underline applied on selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 3)
    keydown(container, 'u', { ctrlKey: true })
    const block = find(editor.getValue(), 'a')
    expect(block.data.inline).toContainEqual({ type: 'Underline', start: 0, end: 3 })
    cleanup(container)
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
    cleanup(container)
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
    cleanup(container)
  })
})

// ─── IME ─────────────────────────────────────────────────────────────────────

describe('IME', () => {
  it('mid-composition input events → getValue unchanged', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const editable = getEditable(container)
    editable.focus()
    const initialState = editor.getValue()

    editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    // Simulate DOM mutation that would normally happen during IME
    const blockEl = editable.querySelector('[id="a"]')!
    const p = blockEl.querySelector('p')!
    p.textContent = 'Hello世'
    editable.dispatchEvent(new Event('input', { bubbles: true }))

    // State should not have changed during composition
    expect(editor.getValue().blocks[0].data.text).toBe('Hello')
    cleanup(container)
  })

  it('compositionend → state updated', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    const editable = getEditable(container)
    editable.focus()

    editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    // Set DOM state as it would be after IME completes
    const blockEl = editable.querySelector('[id="a"]')!
    const p = blockEl.querySelector('p')!
    p.textContent = 'Hello世界'

    // Set cursor after the IME text
    setCursor(container, 'a', 7)

    editable.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    // State should now reflect the IME input
    expect(editor.getValue().blocks[0].data.text).toBe('Hello世界')
    cleanup(container)
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
    cleanup(container)
  })
})

// ─── isInlineActive ───────────────────────────────────────────────────────────

describe('isInlineActive', () => {
  it('returns true when format is active on selection', () => {
    const container = makeContainer()
    const initial = Blocks.from([
      new Block('a', { text: 'Hello', inline: [{ type: 'Bold', start: 0, end: 5 }] }, []),
    ])
    const editor = new BlockEditor(container, initial)
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    expect(editor.isInlineActive('Bold')).toBe(true)
    cleanup(container)
  })

  it('returns false when format is not active', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    expect(editor.isInlineActive('Bold')).toBe(false)
    cleanup(container)
  })

  it('returns false for collapsed selection', () => {
    const container = makeContainer()
    const editor = new BlockEditor(container, Blocks.from([dto('a', 'Hello')]))
    getEditable(container).focus()
    setCursor(container, 'a', 2)
    expect(editor.isInlineActive('Bold')).toBe(false)
    cleanup(container)
  })
})

// ─── BlockEditorWithToolbar ───────────────────────────────────────────────────

describe('BlockEditorWithToolbar', () => {
  it('constructs with one empty block when no initial given', () => {
    const container = makeContainer()
    const editor = new BlockEditorWithToolbar(container)
    expect(editor.getValue().blocks).toHaveLength(1)
    cleanup(container)
  })

  it('getValue / setValue / onChange work', () => {
    const container = makeContainer()
    const editor = new BlockEditorWithToolbar(container)
    const calls: Blocks[] = []
    editor.onChange(b => calls.push(b))
    const newState = Blocks.from([dto('x', 'foo')])
    editor.setValue(newState)
    expect(editor.getValue().blocks[0].id).toBe('x')
    expect(calls).toHaveLength(1)
    cleanup(container)
  })

  it('Bold button click → getValue block has Bold inline', () => {
    const container = makeContainer()
    const editor = new BlockEditorWithToolbar(container, Blocks.from([dto('a', 'Hello')]))
    const editable = container.querySelector('.block-editor-editable') as HTMLElement
    editable.focus()
    setRange(container, 'a', 0, 'a', 5)
    const boldBtn = container.querySelector('[data-inline-type="Bold"]') as HTMLButtonElement
    boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const block = editor.getValue().blocks[0]
    expect(block.data.inline).toContainEqual({ type: 'Bold', start: 0, end: 5 })
    cleanup(container)
  })

  it('Bold button click twice → removed', () => {
    const container = makeContainer()
    const editor = new BlockEditorWithToolbar(container, Blocks.from([dto('a', 'Hello')]))
    const editable = container.querySelector('.block-editor-editable') as HTMLElement
    editable.focus()
    setRange(container, 'a', 0, 'a', 5)
    const boldBtn = container.querySelector('[data-inline-type="Bold"]') as HTMLButtonElement
    boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const block = editor.getValue().blocks[0]
    expect(block.data.inline).toHaveLength(0)
    cleanup(container)
  })

  it('Indent button click → getValue reflects indent', () => {
    const container = makeContainer()
    const editor = new BlockEditorWithToolbar(container, Blocks.from([dto('a', 'AA'), dto('b', 'BB')]))
    const editable = container.querySelector('.block-editor-editable') as HTMLElement
    editable.focus()
    setCursor(container, 'b', 0)
    const indentBtn = container.querySelector('[title="Indent"]') as HTMLButtonElement
    indentBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const blocks = editor.getValue()
    expect(find(blocks, 'a').children.map(x => x.id)).toContain('b')
    cleanup(container)
  })

  it('Outdent button click → getValue reflects unindent', () => {
    const container = makeContainer()
    const editor = new BlockEditorWithToolbar(container, Blocks.from([dto('a', 'AA', [dto('b', 'BB')])]))
    const editable = container.querySelector('.block-editor-editable') as HTMLElement
    editable.focus()
    setCursor(container, 'b', 0)
    const outdentBtn = container.querySelector('[title="Outdent"]') as HTMLButtonElement
    outdentBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const blocks = editor.getValue()
    expect(blocks.blocks.map(x => x.id)).toContain('b')
    expect(find(blocks, 'a').children).toHaveLength(0)
    cleanup(container)
  })
})

// ─── Record<InlineTypes, ...> exhaustiveness ─────────────────────────────────

describe('Record<InlineTypes, HTMLButtonElement> exhaustiveness', () => {
  it('toolbar has buttons for all InlineTypes', () => {
    const container = makeContainer()
    new BlockEditorWithToolbar(container)
    // If any InlineType is missing a button, TypeScript would error at compile time.
    // At runtime, verify all known types have a button
    const types: InlineTypes[] = ['Bold', 'Italic', 'Underline']
    for (const type of types) {
      expect(container.querySelector(`[data-inline-type="${type}"]`)).not.toBeNull()
    }
    cleanup(container)
  })
})
