import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BlockRenderer } from './BlockRenderer'
import { Blocks, TextBlock, BlockOffset, BlockRange } from '../blocks/blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEditable(): HTMLDivElement {
  const div = document.createElement('div')
  div.contentEditable = 'true'
  document.body.appendChild(div)
  return div
}

function dto(id: string, text = '', children: TextBlock[] = []): TextBlock {
  return new TextBlock(id, new Text(text, []), children)
}

/** Set a collapsed DOM cursor inside a block */
function setCursor(editable: HTMLElement, blockId: string, offset: number): void {
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
    // Empty block — cursor at the start
    range.setStart(p, 0)
    range.setEnd(p, 0)
  }

  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Set a range selection across blocks */
function setSelection(
  editable: HTMLElement,
  startBlockId: string, startOffset: number,
  endBlockId: string, endOffset: number,
): void {
  const startBlockEl = editable.querySelector(`[id="${startBlockId}"]`)!
  const endBlockEl = editable.querySelector(`[id="${endBlockId}"]`)!
  const startP = startBlockEl.querySelector('p, h1, h2, h3')!
  const endP = endBlockEl.querySelector('p, h1, h2, h3')!

  const range = document.createRange()

  function findTextNode(parent: Node, offset: number): { node: Node; offset: number } {
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT)
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
    return { node: parent, offset: 0 }
  }

  const start = findTextNode(startP, startOffset)
  const end = findTextNode(endP, endOffset)

  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)

  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('BlockRenderer', () => {
  let editable: HTMLDivElement

  beforeEach(() => {
    editable = makeEditable()
  })

  afterEach(() => {
    editable.remove()
  })

  describe('render', () => {
    it('renders blocks as DOM nodes into the editable element', () => {
      const blocks = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
      const renderer = new BlockRenderer(editable)

      renderer.render(blocks)

      const blockEls = editable.querySelectorAll('.block')
      expect(blockEls).toHaveLength(2)
      expect(blockEls[0].id).toBe('b1')
      expect(blockEls[1].id).toBe('b2')
    })

    it('clears previous content on re-render', () => {
      const renderer = new BlockRenderer(editable)

      renderer.render(Blocks.from([dto('b1', 'First')]))
      renderer.render(Blocks.from([dto('b2', 'Second')]))

      const blockEls = editable.querySelectorAll('.block')
      expect(blockEls).toHaveLength(1)
      expect(blockEls[0].id).toBe('b2')
    })

    it('restores a BlockOffset selection after render', () => {
      const blocks = Blocks.from([dto('b1', 'Hello')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)

      // Focus the editable so selection restoration is meaningful
      editable.focus()

      const cursor = new BlockOffset('b1', 3)
      renderer.render(blocks, cursor)

      const sel = renderer.getSelection()
      expect(sel).toBeInstanceOf(BlockOffset)
      expect((sel as BlockOffset).blockId).toBe('b1')
      expect((sel as BlockOffset).offset).toBe(3)
    })

    it('restores a BlockRange selection after render', () => {
      const blocks = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)
      editable.focus()

      const range = new BlockRange(
        new BlockOffset('b1', 2),
        new BlockOffset('b2', 3),
      )
      renderer.render(blocks, range)

      const sel = renderer.getSelection()
      expect(sel).toBeInstanceOf(BlockRange)
      const r = sel as BlockRange
      expect(r.start.blockId).toBe('b1')
      expect(r.start.offset).toBe(2)
      expect(r.end.blockId).toBe('b2')
      expect(r.end.offset).toBe(3)
    })
  })

  describe('getSelection', () => {
    it('returns null when there is no selection', () => {
      const blocks = Blocks.from([dto('b1', 'Hello')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)

      window.getSelection()!.removeAllRanges()
      expect(renderer.getSelection()).toBeNull()
    })

    it('returns a BlockOffset for a collapsed cursor', () => {
      const blocks = Blocks.from([dto('b1', 'Hello')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)

      setCursor(editable, 'b1', 2)
      const sel = renderer.getSelection()
      expect(sel).toBeInstanceOf(BlockOffset)
      expect((sel as BlockOffset).blockId).toBe('b1')
      expect((sel as BlockOffset).offset).toBe(2)
    })

    it('returns a BlockRange for a non-collapsed selection within one block', () => {
      const blocks = Blocks.from([dto('b1', 'Hello')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)

      setSelection(editable, 'b1', 1, 'b1', 4)
      const sel = renderer.getSelection()
      expect(sel).toBeInstanceOf(BlockRange)
      const r = sel as BlockRange
      expect(r.start.blockId).toBe('b1')
      expect(r.start.offset).toBe(1)
      expect(r.end.blockId).toBe('b1')
      expect(r.end.offset).toBe(4)
    })

    it('returns a BlockRange for a cross-block selection', () => {
      const blocks = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)

      setSelection(editable, 'b1', 2, 'b2', 3)
      const sel = renderer.getSelection()
      expect(sel).toBeInstanceOf(BlockRange)
      const r = sel as BlockRange
      expect(r.start.blockId).toBe('b1')
      expect(r.start.offset).toBe(2)
      expect(r.end.blockId).toBe('b2')
      expect(r.end.offset).toBe(3)
    })

    it('returns null when selection is outside the editable', () => {
      const blocks = Blocks.from([dto('b1', 'Hello')])
      const renderer = new BlockRenderer(editable)
      renderer.render(blocks)

      // Create a selection outside the editable
      const outside = document.createElement('div')
      outside.textContent = 'outside'
      document.body.appendChild(outside)
      const range = document.createRange()
      range.selectNodeContents(outside)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      expect(renderer.getSelection()).toBeNull()
      outside.remove()
    })
  })
})
