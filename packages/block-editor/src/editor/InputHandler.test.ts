import { describe, it, expect, afterEach } from 'vitest'
import { InputHandler } from './InputHandler'
import { BlockRenderer } from './BlockRenderer'
import { EditorHistory } from './EditorHistory'
import { BlockEventEmitter } from './BlockEventEmitter'
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
    range.setStart(p, 0)
    range.setEnd(p, 0)
  }

  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

interface TestContext {
  editable: HTMLDivElement
  renderer: BlockRenderer
  state: Blocks
  emitter: BlockEventEmitter
  handler: InputHandler
}

function setup(blocks: Blocks): TestContext {
  const editable = makeEditable()
  const renderer = new BlockRenderer(editable)
  const state = blocks
  const editorHistory = new EditorHistory()
  const ctx: TestContext = { editable, renderer, state, emitter: null!, handler: null! }
  const sectionHistory = editorHistory.forSection('test', (b) => { ctx.state = b })
  const emitter = new BlockEventEmitter(
    (id) => {
      try {
        const block = ctx.state.getBlock(id)
        return { id, blockType: block.blockType, data: block.data }
      } catch {
        return null
      }
    },
    { debounceMs: 1000, maxWaitMs: 10000 },
  )
  ctx.emitter = emitter
  renderer.render(state)
  const handler = new InputHandler(renderer, () => ctx.state, (s) => { ctx.state = s }, sectionHistory, emitter)
  ctx.handler = handler
  return ctx
}

function teardown(ctx: TestContext): void {
  ctx.emitter.cancelAll()
  ctx.editable.remove()
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('InputHandler', () => {
  let ctx: TestContext

  afterEach(() => {
    if (ctx) teardown(ctx)
  })

  describe('handleEnter', () => {
    it('splits a block at the cursor position', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello World')]))
      setCursor(ctx.editable, 'b1', 5)

      ctx.handler.handleEnter(new BlockOffset('b1', 5))

      expect(ctx.state.blocks).toHaveLength(2)
      expect(ctx.state.blocks[0].getText().text).toBe('Hello')
      expect(ctx.state.blocks[1].getText().text).toBe(' World')
    })
  })

  describe('handleBackspace', () => {
    it('merges with previous block at offset 0', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')]))
      setCursor(ctx.editable, 'b2', 0)

      ctx.handler.handleBackspace(new BlockOffset('b2', 0))

      expect(ctx.state.blocks).toHaveLength(1)
      expect(ctx.state.blocks[0].getText().text).toBe('HelloWorld')
    })

    it('does nothing at offset 0 of first block', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello')]))
      setCursor(ctx.editable, 'b1', 0)

      ctx.handler.handleBackspace(new BlockOffset('b1', 0))

      expect(ctx.state.blocks).toHaveLength(1)
      expect(ctx.state.blocks[0].getText().text).toBe('Hello')
    })

    it('deletes a range selection', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')]))
      const range = new BlockRange(
        new BlockOffset('b1', 3),
        new BlockOffset('b2', 2),
      )

      ctx.handler.handleBackspace(range)

      expect(ctx.state.blocks).toHaveLength(1)
      expect(ctx.state.blocks[0].getText().text).toBe('Helrld')
    })
  })

  describe('handleDelete', () => {
    it('merges with next block at end of block', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')]))
      setCursor(ctx.editable, 'b1', 5)

      ctx.handler.handleDelete(new BlockOffset('b1', 5))

      expect(ctx.state.blocks).toHaveLength(1)
      expect(ctx.state.blocks[0].getText().text).toBe('HelloWorld')
    })

    it('does nothing at end of last block', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello')]))
      setCursor(ctx.editable, 'b1', 5)

      ctx.handler.handleDelete(new BlockOffset('b1', 5))

      expect(ctx.state.blocks).toHaveLength(1)
      expect(ctx.state.blocks[0].getText().text).toBe('Hello')
    })
  })

  describe('deleteRange', () => {
    it('deletes within a single block', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello World')]))
      const range = new BlockRange(
        new BlockOffset('b1', 5),
        new BlockOffset('b1', 11),
      )

      const cursor = ctx.handler.deleteRange(range)

      expect(cursor.blockId).toBe('b1')
      expect(cursor.offset).toBe(5)
      expect(ctx.state.blocks[0].getText().text).toBe('Hello')
    })

    it('deletes across multiple blocks', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')]))
      const range = new BlockRange(
        new BlockOffset('b1', 3),
        new BlockOffset('b2', 2),
      )

      const cursor = ctx.handler.deleteRange(range)

      expect(cursor.blockId).toBe('b1')
      expect(cursor.offset).toBe(3)
      expect(ctx.state.blocks).toHaveLength(1)
      expect(ctx.state.blocks[0].getText().text).toBe('Helrld')
    })
  })

  describe('insertCharOverRange', () => {
    it('deletes the range and inserts a character', () => {
      ctx = setup(Blocks.from([dto('b1', 'Hello World')]))
      const range = new BlockRange(
        new BlockOffset('b1', 5),
        new BlockOffset('b1', 11),
      )

      ctx.handler.insertCharOverRange(range, 'X')

      expect(ctx.state.blocks[0].getText().text).toBe('HelloX')
    })
  })
})
