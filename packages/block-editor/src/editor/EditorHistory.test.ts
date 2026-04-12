import { describe, it, expect, vi } from 'vitest'
import { EditorHistory } from './EditorHistory'
import { Blocks, TextBlock, BlockDataChanged, BlockAdded, BlockOffset } from '../blocks/blocks'
import { Text } from '../text/text'
import type { ISectionHistory } from './EditorHistory'
import type { BlockSelection } from './events'

// ─── helpers ──────────────────────────────────────────────────────────────────

function dto(id: string, text = ''): TextBlock {
  return new TextBlock(id, new Text(text, []), [])
}

function makeBlocks(...ids: string[]): Blocks {
  return Blocks.from(ids.map(id => dto(id)))
}

function sel(blockId: string, offset: number): BlockOffset {
  return new BlockOffset(blockId, offset)
}

// ─── EditorHistory — single section ───────────────────────────────────────────

describe('EditorHistory — single section', () => {
  it('canUndo is false before any add', () => {
    const h = new EditorHistory()
    h.forSection('s1', () => {})
    expect(h.canUndo()).toBe(false)
  })

  it('canRedo is false before any add', () => {
    const h = new EditorHistory()
    h.forSection('s1', () => {})
    expect(h.canRedo()).toBe(false)
  })

  it('canUndo is true after add', () => {
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    const base = makeBlocks('a')
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], null, null)
    expect(h.canUndo()).toBe(true)
  })

  it('canRedo is false after add (no undo yet)', () => {
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    const base = makeBlocks('a')
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], null, null)
    expect(h.canRedo()).toBe(false)
  })

  it('undo calls applyFn with base and selBefore', () => {
    const applied: Array<{ blocks: Blocks; sel: BlockSelection | undefined }> = []
    const h = new EditorHistory()
    const base = makeBlocks('a')
    const selBefore = sel('a', 0)
    const sh = h.forSection('s1', (blocks, s) => { applied.push({ blocks, sel: s }) })
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], selBefore, sel('a', 2))
    h.undo()
    expect(applied).toHaveLength(1)
    expect(applied[0].blocks).toBe(base)
    expect(applied[0].sel).toBe(selBefore)
  })

  it('redo calls applyFn with reconstructed state and selAfter', () => {
    const applied: Array<{ blocks: Blocks; sel: BlockSelection | undefined }> = []
    const h = new EditorHistory()
    const base = makeBlocks('a')
    const selAfter = sel('a', 2)
    const sh = h.forSection('s1', (blocks, s) => { applied.push({ blocks, sel: s }) })
    const change = new BlockDataChanged('a', 'text', new Text('hi', []))
    sh.add(base, [change], null, selAfter)
    h.undo()
    applied.length = 0
    h.redo()
    expect(applied).toHaveLength(1)
    expect(applied[0].blocks.getBlock('a').getText().text).toBe('hi')
    expect(applied[0].sel).toBe(selAfter)
  })

  it('undo throws when stack is empty', () => {
    const h = new EditorHistory()
    expect(() => h.undo()).toThrow('Nothing to undo')
  })

  it('redo throws when nothing to redo', () => {
    const h = new EditorHistory()
    expect(() => h.redo()).toThrow('Nothing to redo')
  })

  it('null selBefore and selAfter pass undefined to applyFn', () => {
    const applied: Array<{ sel: BlockSelection | undefined }> = []
    const h = new EditorHistory()
    const base = makeBlocks('a')
    const sh = h.forSection('s1', (_, s) => { applied.push({ sel: s }) })
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], null, null)
    h.undo()
    expect(applied[0].sel).toBeUndefined()
    h.redo()
    expect(applied[1].sel).toBeUndefined()
  })

  it('after undo canRedo is true', () => {
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    const base = makeBlocks('a')
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], null, null)
    h.undo()
    expect(h.canRedo()).toBe(true)
    expect(h.canUndo()).toBe(false)
  })

  it('new add after undo clears redo stack', () => {
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    const base = makeBlocks('a')
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], null, null)
    h.undo()
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('bye', []))], null, null)
    expect(h.canRedo()).toBe(false)
  })

  it('reset clears the stack', () => {
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    const base = makeBlocks('a')
    sh.add(base, [new BlockDataChanged('a', 'text', new Text('hi', []))], null, null)
    sh.reset(base)
    expect(h.canUndo()).toBe(false)
  })

  it('MAX_DEPTH: oldest entry evicted, subsequent undo still correct', () => {
    const applied: Array<{ blocks: Blocks }> = []
    const base = makeBlocks('a')
    const h = new EditorHistory()
    const sh = h.forSection('s1', (blocks) => { applied.push({ blocks }) })
    for (let i = 0; i <= EditorHistory.MAX_DEPTH; i++) {
      sh.add(base, [new BlockDataChanged('a', 'text', new Text(`step${i}`, []))], null, null)
    }
    expect(h.canUndo()).toBe(true)
    expect(h.canRedo()).toBe(false)
    // Should be able to undo MAX_DEPTH times, not MAX_DEPTH + 1
    for (let i = 0; i < EditorHistory.MAX_DEPTH; i++) {
      h.undo()
    }
    expect(h.canUndo()).toBe(false)
  })
})

// ─── EditorHistory — updateOrAdd coalescing ───────────────────────────────────

describe('EditorHistory — updateOrAdd', () => {
  it('coalesces BlockDataChanged for same block', () => {
    const applied: Array<Blocks> = []
    const base = makeBlocks('a')
    const h = new EditorHistory()
    const sh = h.forSection('s1', (blocks) => { applied.push(blocks) })
    sh.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('h', []))], null, null)
    sh.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('he', []))], null, null)
    sh.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('hel', []))], null, null)
    // one entry — undo once reaches canUndo=false
    h.undo()
    expect(h.canUndo()).toBe(false)
    // redo should get 'hel'
    h.redo()
    expect(applied[applied.length - 1].getBlock('a').getText().text).toBe('hel')
  })

  it('preserves original base and selBefore when coalescing', () => {
    const applied: Array<{ blocks: Blocks; sel: BlockSelection | undefined }> = []
    const baseOrig = makeBlocks('a')
    const baseLater = makeBlocks('a')
    const origSel = sel('a', 0)
    const h = new EditorHistory()
    const sh = h.forSection('s1', (blocks, s) => { applied.push({ blocks, sel: s }) })
    sh.updateOrAdd('a', baseOrig, [new BlockDataChanged('a', 'text', new Text('h', []))], origSel, sel('a', 1))
    sh.updateOrAdd('a', baseLater, [new BlockDataChanged('a', 'text', new Text('he', []))], sel('a', 1), sel('a', 2))
    h.undo()
    expect(applied[0].blocks).toBe(baseOrig)  // original base preserved
    expect(applied[0].sel).toBe(origSel)       // original selBefore preserved
  })

  it('does NOT coalesce when last entry has structural changes (multiple changes)', () => {
    const base = makeBlocks('a', 'b')
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    sh.add(base, [
      new BlockDataChanged('a', 'text', new Text('x', [])),
      new BlockDataChanged('b', 'text', new Text('y', [])),
    ], null, null)
    sh.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('z', []))], null, null)
    // two entries in stack
    h.undo()
    expect(h.canUndo()).toBe(true)
  })

  it('does NOT coalesce when last entry targets different block', () => {
    const base = makeBlocks('a', 'b')
    const h = new EditorHistory()
    const sh = h.forSection('s1', () => {})
    sh.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('x', []))], null, null)
    sh.updateOrAdd('b', base, [new BlockDataChanged('b', 'text', new Text('y', []))], null, null)
    h.undo()
    expect(h.canUndo()).toBe(true)
  })

  it('does NOT coalesce when last entry is from a different section', () => {
    const base = makeBlocks('a')
    const h = new EditorHistory()
    const sh1 = h.forSection('s1', () => {})
    const sh2 = h.forSection('s2', () => {})
    sh1.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('x', []))], null, null)
    sh2.updateOrAdd('a', base, [new BlockDataChanged('a', 'text', new Text('y', []))], null, null)
    h.undo()
    expect(h.canUndo()).toBe(true)
  })
})

// ─── EditorHistory — multi-section ────────────────────────────────────────────

describe('EditorHistory — multi-section', () => {
  it('add on two sections independently creates separate stack entries', () => {
    const base = makeBlocks('a')
    const h = new EditorHistory()
    const sh1 = h.forSection('s1', () => {})
    const sh2 = h.forSection('s2', () => {})
    sh1.add(base, [new BlockDataChanged('a', 'text', new Text('x', []))], null, null)
    sh2.add(base, [new BlockDataChanged('a', 'text', new Text('y', []))], null, null)
    // Two separate entries — two undos needed
    h.undo()
    expect(h.canUndo()).toBe(true)
    h.undo()
    expect(h.canUndo()).toBe(false)
  })

  it('batch: two add() calls become one atomic stack entry', () => {
    const base = makeBlocks('a')
    const h = new EditorHistory()
    const sh1 = h.forSection('s1', () => {})
    const sh2 = h.forSection('s2', () => {})
    h.batch(() => {
      sh1.add(base, [new BlockDataChanged('a', 'text', new Text('x', []))], null, null)
      sh2.add(base, [new BlockDataChanged('a', 'text', new Text('y', []))], null, null)
    })
    // One entry — single undo
    h.undo()
    expect(h.canUndo()).toBe(false)
  })

  it('undo on a batch entry calls applyFn for all sections', () => {
    const base1 = makeBlocks('a')
    const base2 = makeBlocks('b')
    const applied1: Blocks[] = []
    const applied2: Blocks[] = []
    const h = new EditorHistory()
    const sh1 = h.forSection('s1', (blocks) => { applied1.push(blocks) })
    const sh2 = h.forSection('s2', (blocks) => { applied2.push(blocks) })
    h.batch(() => {
      sh1.add(base1, [new BlockDataChanged('a', 'text', new Text('x', []))], null, null)
      sh2.add(base2, [new BlockDataChanged('b', 'text', new Text('y', []))], null, null)
    })
    h.undo()
    expect(applied1).toHaveLength(1)
    expect(applied1[0]).toBe(base1)
    expect(applied2).toHaveLength(1)
    expect(applied2[0]).toBe(base2)
  })

  it('redo on a batch entry advances both sections', () => {
    const base1 = makeBlocks('a')
    const base2 = makeBlocks('b')
    const applied1: Blocks[] = []
    const applied2: Blocks[] = []
    const h = new EditorHistory()
    const sh1 = h.forSection('s1', (blocks) => { applied1.push(blocks) })
    const sh2 = h.forSection('s2', (blocks) => { applied2.push(blocks) })
    h.batch(() => {
      sh1.add(base1, [new BlockDataChanged('a', 'text', new Text('x', []))], null, null)
      sh2.add(base2, [new BlockDataChanged('b', 'text', new Text('y', []))], null, null)
    })
    h.undo()
    applied1.length = 0
    applied2.length = 0
    h.redo()
    expect(applied1[0].getBlock('a').getText().text).toBe('x')
    expect(applied2[0].getBlock('b').getText().text).toBe('y')
  })

  it('batch with no adds produces no stack entry', () => {
    const h = new EditorHistory()
    h.batch(() => { /* nothing */ })
    expect(h.canUndo()).toBe(false)
  })
})
