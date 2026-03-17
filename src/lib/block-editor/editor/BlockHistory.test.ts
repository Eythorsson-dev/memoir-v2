import { describe, it, expect } from 'vitest'
import { BlockHistory } from './BlockHistory'
import { Blocks, Block, BlockDataChanged, BlockAdded, BlockRemoved } from '../blocks/blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function dto(id: string, text = '', children: Block[] = []): Block {
  return new Block(id, { text, inline: [] }, children)
}

function makeBlocks(...ids: string[]): Blocks {
  return Blocks.from(ids.map(id => dto(id)))
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
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      expect(h.canUndo()).toBe(true)
    })

    it('after add, canRedo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      expect(h.canRedo()).toBe(false)
    })

    it('events reflects added changes', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const change = new BlockDataChanged('a', { text: 'hello', inline: [] })
      h.add([change])
      expect(h.events).toEqual([change])
    })

    it('multiple adds accumulate in events', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', { text: 'hi', inline: [] })
      const c2 = new BlockDataChanged('a', { text: 'hi world', inline: [] })
      h.add([c1])
      h.add([c2])
      expect(h.events).toEqual([c1, c2])
    })
  })

  describe('undo', () => {
    it('undo returns base state when one transaction added', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      const result = h.undo()
      expect(result).toBe(base)
    })

    it('after undo, canUndo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      h.undo()
      expect(h.canUndo()).toBe(false)
    })

    it('after undo, canRedo is true', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      h.undo()
      expect(h.canRedo()).toBe(true)
    })

    it('after undo, events is empty', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      h.undo()
      expect(h.events).toHaveLength(0)
    })

    it('undo two steps returns intermediate state', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hi', inline: [] })])
      h.add([new BlockDataChanged('a', { text: 'hi world', inline: [] })])
      // undo once → should replay first transaction only
      const result = h.undo()
      // Should have 'hi' text — reconstructed from base + first change
      expect(result.getBlock('a').data.text).toBe('hi')
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
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      h.undo()
      const result = h.redo()
      expect(result.getBlock('a').data.text).toBe('hello')
    })

    it('after redo, canRedo is false', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      h.undo()
      h.redo()
      expect(h.canRedo()).toBe(false)
    })

    it('after redo, canUndo is true', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
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
      h.add([new BlockDataChanged('a', { text: 'hello', inline: [] })])
      h.undo()
      h.add([new BlockDataChanged('a', { text: 'different', inline: [] })])
      expect(h.canRedo()).toBe(false)
    })

    it('events after add-undo-add reflects new transaction only', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', { text: 'hello', inline: [] })
      h.add([c1])
      h.undo()
      const c2 = new BlockDataChanged('a', { text: 'different', inline: [] })
      h.add([c2])
      expect(h.events).toEqual([c2])
    })
  })

  describe('MAX_DEPTH cap', () => {
    it('oldest transaction dropped when exceeding MAX_DEPTH', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      // add MAX_DEPTH + 1 transactions
      for (let i = 0; i <= BlockHistory.MAX_DEPTH; i++) {
        h.add([new BlockDataChanged('a', { text: `step${i}`, inline: [] })])
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
      h.updateOrAdd('a', new BlockDataChanged('a', { text: 'h', inline: [] }))
      h.updateOrAdd('a', new BlockDataChanged('a', { text: 'he', inline: [] }))
      h.updateOrAdd('a', new BlockDataChanged('a', { text: 'hel', inline: [] }))
      // should be one transaction, one event
      expect(h.events).toHaveLength(1)
      expect((h.events[0] as BlockDataChanged).data.text).toBe('hel')
    })

    it('does not coalesce if last transaction has multiple changes', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      // add a transaction with two changes (simulating a structural change)
      h.add([
        new BlockDataChanged('a', { text: 'x', inline: [] }),
        new BlockDataChanged('b', { text: 'y', inline: [] }),
      ])
      h.updateOrAdd('a', new BlockDataChanged('a', { text: 'z', inline: [] }))
      expect(h.events).toHaveLength(3)
    })

    it('does not coalesce if last transaction targets different block', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      h.updateOrAdd('a', new BlockDataChanged('a', { text: 'x', inline: [] }))
      h.updateOrAdd('b', new BlockDataChanged('b', { text: 'y', inline: [] }))
      expect(h.events).toHaveLength(2)
    })

    it('creates new entry when no prior transaction', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      h.updateOrAdd('a', new BlockDataChanged('a', { text: 'hello', inline: [] }))
      expect(h.canUndo()).toBe(true)
    })
  })

  describe('events getter', () => {
    it('returns flat list up to pointer', () => {
      const base = makeBlocks('a')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', { text: 'a', inline: [] })
      const c2 = new BlockDataChanged('a', { text: 'ab', inline: [] })
      const c3 = new BlockDataChanged('a', { text: 'abc', inline: [] })
      h.add([c1])
      h.add([c2])
      h.add([c3])
      h.undo() // pointer at 2
      expect(h.events).toEqual([c1, c2])
    })

    it('multiple changes in one transaction are included', () => {
      const base = makeBlocks('a', 'b')
      const h = new BlockHistory(base)
      const c1 = new BlockDataChanged('a', { text: 'x', inline: [] })
      const c2 = new BlockDataChanged('b', { text: 'y', inline: [] })
      h.add([c1, c2])
      expect(h.events).toEqual([c1, c2])
    })
  })
})
