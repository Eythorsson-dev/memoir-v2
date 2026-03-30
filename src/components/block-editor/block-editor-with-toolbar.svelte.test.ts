import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-svelte'
import BlockEditorWithToolbar from './block-editor-with-toolbar.svelte'
import { Blocks, TextBlock } from '$lib/block-editor'
import { Text } from '$lib/block-editor'
import type { Block } from '$lib/block-editor'
import type { BlockEditorChangeEvent } from './block-editor-with-toolbar.svelte'

// ─── helpers ──────────────────────────────────────────────────────────────────

function dto(id: string, text = '', children: TextBlock[] = []): TextBlock {
  return new TextBlock(id, new Text(text, []), children)
}

function getEditable(container: HTMLElement): HTMLElement {
  return container.querySelector('.block-editor-editable') as HTMLElement
}

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

// ─── BlockEditorWithToolbar ───────────────────────────────────────────────────

afterEach(() => cleanup())

describe('BlockEditorWithToolbar', () => {
  it('constructs with one empty block when no initial given', async () => {
    const { container } = await render(BlockEditorWithToolbar)
    expect(getEditable(container).querySelectorAll('[id]')).toHaveLength(1)
  })

  it('renders buttons for all inline types', async () => {
    const { container } = await render(BlockEditorWithToolbar)
    for (const type of ['Bold', 'Italic', 'Underline'] as const) {
      expect(container.querySelector(`[aria-label="${type}"]`), `button for ${type}`).not.toBeNull()
    }
  })

  it('Bold button click → block has Bold inline', async () => {
    const changes: BlockEditorChangeEvent[] = []
    const { container } = await render(BlockEditorWithToolbar, {
      props: {
        initial: Blocks.from([dto('a', 'Hello')]),
        onchange: (e) => changes.push(e),
      },
    })
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    container.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(changes.length).toBeGreaterThan(0)
    expect(find(changes[changes.length - 1].blocks, 'a').data.inline)
      .toContainEqual({ type: 'Bold', start: 0, end: 5 })
  })

  it('Bold button click twice → inline removed', async () => {
    const changes: BlockEditorChangeEvent[] = []
    const { container } = await render(BlockEditorWithToolbar, {
      props: {
        initial: Blocks.from([dto('a', 'Hello')]),
        onchange: (e) => changes.push(e),
      },
    })
    getEditable(container).focus()
    setRange(container, 'a', 0, 'a', 5)
    const boldBtn = container.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!
    boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(find(changes[changes.length - 1].blocks, 'a').data.inline).toHaveLength(0)
  })

  it('Indent button click → block is indented under previous', async () => {
    const changes: BlockEditorChangeEvent[] = []
    const { container } = await render(BlockEditorWithToolbar, {
      props: {
        initial: Blocks.from([dto('a', 'AA'), dto('b', 'BB')]),
        onchange: (e) => changes.push(e),
      },
    })
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    container.querySelector<HTMLButtonElement>('[aria-label="Indent"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(changes.length).toBeGreaterThan(0)
    expect(find(changes[changes.length - 1].blocks, 'a').children.map((x: Block<unknown>) => x.id))
      .toContain('b')
  })

  it('Outdent button click → block is lifted to root', async () => {
    const changes: BlockEditorChangeEvent[] = []
    const { container } = await render(BlockEditorWithToolbar, {
      props: {
        initial: Blocks.from([dto('a', 'AA', [dto('b', 'BB')])]),
        onchange: (e) => changes.push(e),
      },
    })
    getEditable(container).focus()
    setCursor(container, 'b', 0)
    container.querySelector<HTMLButtonElement>('[aria-label="Outdent"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(changes.length).toBeGreaterThan(0)
    const lastBlocks = changes[changes.length - 1].blocks
    expect(lastBlocks.blocks.map((x: Block<unknown>) => x.id)).toContain('b')
    expect(find(lastBlocks, 'a').children).toHaveLength(0)
  })
})
