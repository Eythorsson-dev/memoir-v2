import { describe, it, expect } from 'vitest'
import { BlockHistory } from './BlockHistory'
import { Blocks, TextBlock, BlockDataChanged, BlockAdded, BlockRemoved, BlockOffset } from '../blocks/blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function dto(id: string, text = '', children: TextBlock[] = []): TextBlock {
  return new TextBlock(id, new Text(text, []), children)
}

function makeBlocks(...ids: string[]): Blocks {
  return Blocks.from(ids.map(id => dto(id)))
}

function sel(blockId: string, offset: number): BlockOffset {
  return new BlockOffset(blockId, offset)
}

// ─── BlockHistory ─────────────────────────────────────────────────────────────

describe('BlockHistory', () => {
  describe('initial state', () => {
    it('canUndo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      expect(h.canUndo()).toBe(false)
    })

    it('canRedo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      expect(h.canRedo()).toBe(false)
    })

    it('events is empty', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      expect(h.events).toHaveLength(0)
    })
  })

  describe('add', () => {
    it('after add, canUndo is true', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      expect(h.canUndo()).toBe(true)
    })

    it('after add, canRedo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      expect(h.canRedo()).toBe(false)
    })

    it('events reflects added changes', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const change = new BlockDataChanged('a', new Text('hello', []), 'text')
      h.add([change], null, null)
      expect(h.events).toEqual([change])
    })

    it('multiple adds accumulate in events', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', new Text('hi', []), 'text')
      const c2 = new BlockDataChanged('a', new Text('hi world', []), 'text')
      h.add([c1], null, null)
      h.add([c2], null, null)
      expect(h.events).toEqual([c1, c2])
    })

    it('stores selectionBefore and selectionAfter', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const before = sel('a', 0)
      const after = sel('a', 5)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], before, after)
      const { selection: undoSel } = h.undo()
      expect(undoSel).toBe(before)
    })

    it('redo returns selectionAfter', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const before = sel('a', 0)
      const after = sel('a', 5)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], before, after)
      h.undo()
      const { selection: redoSel } = h.redo()
      expect(redoSel).toBe(after)
    })

    it('null selections round-trip correctly', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      const { selection: undoSel } = h.undo()
      expect(undoSel).toBeNull()
      const { selection: redoSel } = h.redo()
      expect(redoSel).toBeNull()
    })
  })

  describe('undo', () => {
    it('undo returns base state when one transaction added', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      const { blocks } = h.undo()
      expect(blocks).toBe(base)
    })

    it('after undo, canUndo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      expect(h.canUndo()).toBe(false)
    })

    it('after undo, canRedo is true', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      expect(h.canRedo()).toBe(true)
    })

    it('after undo, events is empty', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      expect(h.events).toHaveLength(0)
    })

    it('undo two steps returns intermediate state', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hi', []), 'text')], null, null)
      h.add([new BlockDataChanged('a', new Text('hi world', []), 'text')], null, null)
      // undo once → should replay first transaction only
      const { blocks } = h.undo()
      // Should have 'hi' text — reconstructed from base + first change
      expect(blocks.getBlock('a').data.text).toBe('hi')
    })

    it('throws if canUndo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      expect(() => h.undo()).toThrow()
    })
  })

  describe('redo', () => {
    it('redo after undo returns forward state', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      const { blocks } = h.redo()
      expect(blocks.getBlock('a').data.text).toBe('hello')
    })

    it('after redo, canRedo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      h.redo()
      expect(h.canRedo()).toBe(false)
    })

    it('after redo, canUndo is true', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      h.redo()
      expect(h.canUndo()).toBe(true)
    })

    it('throws if canRedo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      expect(() => h.redo()).toThrow()
    })
  })

  describe('redo stack cleared on add after undo', () => {
    it('new add after undo clears redo stack', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', new Text('hello', []), 'text')], null, null)
      h.undo()
      h.add([new BlockDataChanged('a', new Text('different', []), 'text')], null, null)
      expect(h.canRedo()).toBe(false)
    })

    it('events after add-undo-add reflects new transaction only', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', new Text('hello', []), 'text')
      h.add([c1], null, null)
      h.undo()
      const c2 = new BlockDataChanged('a', new Text('different', []), 'text')
      h.add([c2], null, null)
      expect(h.events).toEqual([c2])
    })
  })

  describe('MAX_DEPTH cap', () => {
    it('oldest transaction dropped when exceeding MAX_DEPTH', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      // add MAX_DEPTH + 1 transactions
      for (let i = 0; i <= BlockHistory.MAX_DEPTH; i++) {
        h.add([new BlockDataChanged('a', new Text(`step${i}`, []), 'text')], null, null)
      }
      // pointer should equal MAX_DEPTH (not MAX_DEPTH + 1)
      expect(h.canUndo()).toBe(true)
      expect(h.canRedo()).toBe(false)
      // undo MAX_DEPTH times should reach base
      for (let i = 0; i < BlockHistory.MAX_DEPTH; i++) {
        h.undo()
      }
      expect(h.canUndo()).toBe(false)
    })
  })

  describe('updateOrAdd', () => {
    it('coalesces BlockDataChanged for same block', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('h', []), 'text'), null, null)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('he', []), 'text'), null, null)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('hel', []), 'text'), null, null)
      // should be one transaction, one event
      expect(h.events).toHaveLength(1)
      expect((h.events[0] as BlockDataChanged).data.text).toBe('hel')
    })

    it('does not coalesce if last transaction has multiple changes', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      // add a transaction with two changes (simulating a structural change)
      h.add([
        new BlockDataChanged('a', new Text('x', []), 'text'),
        new BlockDataChanged('b', new Text('y', []), 'text'),
      ], null, null)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('z', []), 'text'), null, null)
      expect(h.events).toHaveLength(3)
    })

    it('does not coalesce if last transaction targets different block', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('x', []), 'text'), null, null)
      h.updateOrAdd('b', new BlockDataChanged('b', new Text('y', []), 'text'), null, null)
      expect(h.events).toHaveLength(2)
    })

    it('creates new entry when no prior transaction', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('hello', []), 'text'), null, null)
      expect(h.canUndo()).toBe(true)
    })

    it('coalescing preserves original selectionBefore and updates selectionAfter', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const firstBefore = sel('a', 0)
      const firstAfter = sel('a', 1)
      const secondAfter = sel('a', 2)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('h', []), 'text'), firstBefore, firstAfter)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('he', []), 'text'), sel('a', 1), secondAfter)
      // undo → should return firstBefore (original start of burst)
      const { selection: undoSel } = h.undo()
      expect(undoSel).toBe(firstBefore)
    })

    it('coalescing updates selectionAfter to latest value', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const firstAfter = sel('a', 1)
      const secondAfter = sel('a', 2)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('h', []), 'text'), null, firstAfter)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('he', []), 'text'), null, secondAfter)
      h.undo()
      const { selection: redoSel } = h.redo()
      expect(redoSel).toBe(secondAfter)
    })

    it('non-coalescing updateOrAdd uses provided selectionBefore', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      h.updateOrAdd('a', new BlockDataChanged('a', new Text('x', []), 'text'), null, null)
      const bBefore = sel('b', 0)
      h.updateOrAdd('b', new BlockDataChanged('b', new Text('y', []), 'text'), bBefore, null)
      // undo the second entry → should return bBefore
      const { selection: undoSel } = h.undo()
      expect(undoSel).toBe(bBefore)
    })
  })

  describe('events getter', () => {
    it('returns flat list up to pointer', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', new Text('a', []), 'text')
      const c2 = new BlockDataChanged('a', new Text('ab', []), 'text')
      const c3 = new BlockDataChanged('a', new Text('abc', []), 'text')
      h.add([c1], null, null)
      h.add([c2], null, null)
      h.add([c3], null, null)
      h.undo() // pointer at 2
      expect(h.events).toEqual([c1, c2])
    })

    it('multiple changes in one transaction are included', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', new Text('x', []), 'text')
      const c2 = new BlockDataChanged('b', new Text('y', []), 'text')
      h.add([c1, c2], null, null)
      expect(h.events).toEqual([c1, c2])
    })
  })
})
