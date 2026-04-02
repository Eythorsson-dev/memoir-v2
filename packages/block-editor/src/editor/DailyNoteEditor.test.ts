import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DailyNoteEditor } from './DailyNoteEditor'
import { TextBlock } from '../blocks/blocks'
import { Text } from '../text/text'
import type { NoteProvider } from './NoteProvider'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return div
}

function makeProvider(
  blocks: TextBlock[] | null = null,
): NoteProvider & { saveCalls: Array<{ date: string }> } {
  const saveCalls: Array<{ date: string }> = []
  return {
    saveCalls,
    load: vi.fn().mockResolvedValue(blocks),
    save: vi.fn().mockImplementation((date: string) => {
      saveCalls.push({ date })
      return Promise.resolve()
    }),
  }
}

function getEditable(container: HTMLElement): HTMLElement {
  return container.querySelector('.block-editor-editable') as HTMLElement
}

function keydown(container: HTMLElement, key: string): void {
  const editable = getEditable(container)
  editable.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

function setCursor(container: HTMLElement, blockId: string, offset: number): void {
  const editable = getEditable(container)
  const blockEl = editable.querySelector(`[id="${blockId}"]`)!
  const p = blockEl.querySelector('p, h1, h2, h3')!

  const range = document.createRange()
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()

  if (node) {
    range.setStart(node, offset)
    range.setEnd(node, offset)
  } else {
    range.setStart(p, 0)
    range.setEnd(p, 0)
  }

  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('DailyNoteEditor', () => {
  const containers: HTMLElement[] = []
  const editors: DailyNoteEditor[] = []

  afterEach(() => {
    editors.forEach((e) => e.destroy())
    containers.forEach((c) => c.remove())
    editors.length = 0
    containers.length = 0
  })

  function make(
    provider: NoteProvider,
    date = '2024-01-15',
  ): { editor: DailyNoteEditor; container: HTMLElement } {
    const container = makeContainer()
    containers.push(container)
    const editor = new DailyNoteEditor(container, provider, date)
    editors.push(editor)
    return { editor, container }
  }

  it('mounts elements into the container', () => {
    const { container } = make(makeProvider())
    expect(container.children.length).toBeGreaterThan(0)
  })

  it('renders a non-editable date header', () => {
    const { container } = make(makeProvider(), '2024-01-15')
    const header = container.querySelector('.daily-note-header')
    expect(header).toBeTruthy()
    expect(header!.getAttribute('contenteditable')).not.toBe('true')
    expect((header as HTMLElement).textContent!.length).toBeGreaterThan(0)
  })

  it('renders an editable content area', () => {
    const { container } = make(makeProvider())
    const editable = getEditable(container)
    expect(editable).toBeTruthy()
    expect(editable.contentEditable).toBe('true')
  })

  it('starts with one empty block when provider returns null', async () => {
    const { container } = make(makeProvider(null))
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.block').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('loads and renders blocks from provider', async () => {
    const blocks = [new TextBlock('b1', new Text('hello world', []), [])]
    const { container } = make(makeProvider(blocks))

    await vi.waitFor(() => {
      expect(container.querySelector('[id="b1"]')).toBeTruthy()
    })
    expect(getEditable(container).textContent).toContain('hello world')
  })

  it('calls provider.load with the given date', async () => {
    const provider = makeProvider()
    make(provider, '2024-03-20')
    await vi.waitFor(() => {
      expect(provider.load).toHaveBeenCalledWith('2024-03-20')
    })
  })

  it('saves via provider on structural change', async () => {
    const blocks = [new TextBlock('b1', new Text('hello', []), [])]
    const provider = makeProvider(blocks)
    const { container } = make(provider, '2024-01-15')

    // Wait for initial load
    await vi.waitFor(() => {
      expect(container.querySelector('[id="b1"]')).toBeTruthy()
    })

    // Place cursor at end of b1 and press Enter
    setCursor(container, 'b1', 5)
    keydown(container, 'Enter')

    expect(provider.saveCalls.length).toBeGreaterThan(0)
    expect(provider.saveCalls[0].date).toBe('2024-01-15')
  })

  it('does not call setValue after destroy', async () => {
    const blocks = [new TextBlock('b1', new Text('loaded', []), [])]
    let resolveLoad!: (v: TextBlock[] | null) => void
    const provider: NoteProvider = {
      load: () => new Promise((res) => { resolveLoad = res }),
      save: vi.fn().mockResolvedValue(undefined),
    }

    const container = makeContainer()
    containers.push(container)
    const editor = new DailyNoteEditor(container, provider, '2024-01-15')
    // Destroy before load completes
    editor.destroy()
    // Now resolve — should not throw or update DOM
    resolveLoad(blocks)
    // Small tick to let the promise chain run
    await Promise.resolve()
    // Block b1 should NOT be in the (already-destroyed) editor
    expect(container.querySelector('[id="b1"]')).toBeFalsy()
  })
})
