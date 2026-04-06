import { describe, it, expect, vi } from 'vitest'
import { DailyNoteHistory } from './DailyNoteHistory'
import { Blocks, TextBlock, BlockOffset } from '../blocks/blocks'
import { Text } from '../text/text'
import type { NoteProvider } from './NoteProvider'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeProvider(): NoteProvider & { saveCalls: Array<{ date: string; blocks: unknown }> } {
  const saveCalls: Array<{ date: string; blocks: unknown }> = []
  return {
    saveCalls,
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation((date: string, blocks: unknown) => {
      saveCalls.push({ date, blocks })
      return Promise.resolve()
    }),
  }
}

function makeBlocks(...texts: string[]): Blocks {
  return Blocks.from(texts.map((t, i) => new TextBlock(`b${i}`, new Text(t, []), [])))
}

function sel(blockId: string, offset: number): BlockOffset {
  return new BlockOffset(blockId, offset)
}

// ─── DailyNoteHistory ─────────────────────────────────────────────────────────

describe('DailyNoteHistory', () => {
  describe('initial state', () => {
    it('canUndo is false', () => {
      const h = new DailyNoteHistory(makeProvider())
      expect(h.canUndo()).toBe(false)
    })

    it('canRedo is false', () => {
      const h = new DailyNoteHistory(makeProvider())
      expect(h.canRedo()).toBe(false)
    })

    it('throws on undo when empty', () => {
      const h = new DailyNoteHistory(makeProvider())
      expect(() => h.undo()).toThrow()
    })

    it('throws on redo when empty', () => {
      const h = new DailyNoteHistory(makeProvider())
      expect(() => h.redo()).toThrow()
    })
  })

  describe('add', () => {
    it('canUndo becomes true after add', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('before'), makeBlocks('after'), null, null)
      expect(h.canUndo()).toBe(true)
    })

    it('canRedo remains false after add', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('before'), makeBlocks('after'), null, null)
      expect(h.canRedo()).toBe(false)
    })
  })

  describe('undo', () => {
    it('returns noteId, blocksBefore, and selectionBefore', () => {
      const h = new DailyNoteHistory(makeProvider())
      const before = makeBlocks('hello')
      const after = makeBlocks('hello world')
      const selBefore = sel('b0', 0)
      h.add('2024-01-15', before, after, selBefore, sel('b0', 5))
      const result = h.undo()
      expect(result.noteId).toBe('2024-01-15')
      expect(result.blocks).toBe(before)
      expect(result.selection).toBe(selBefore)
    })

    it('calls provider.save with noteId and blocksBefore', () => {
      const provider = makeProvider()
      const h = new DailyNoteHistory(provider)
      const before = makeBlocks('old')
      const after = makeBlocks('new')
      h.add('2024-01-15', before, after, null, null)
      h.undo()
      expect(provider.save).toHaveBeenCalledWith('2024-01-15', before.blocks)
    })

    it('canUndo becomes false after undoing the only entry', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('a'), makeBlocks('b'), null, null)
      h.undo()
      expect(h.canUndo()).toBe(false)
    })

    it('canRedo becomes true after undo', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('a'), makeBlocks('b'), null, null)
      h.undo()
      expect(h.canRedo()).toBe(true)
    })

    it('undo twice returns entries in reverse order', () => {
      const h = new DailyNoteHistory(makeProvider())
      const b1 = makeBlocks('step1')
      const b2 = makeBlocks('step2')
      const b3 = makeBlocks('step3')
      h.add('2024-01-15', b1, b2, null, null)
      h.add('2024-01-15', b2, b3, null, null)
      const r1 = h.undo()
      expect(r1.blocks).toBe(b2)
      const r2 = h.undo()
      expect(r2.blocks).toBe(b1)
    })
  })

  describe('redo', () => {
    it('returns noteId, blocksAfter, and selectionAfter', () => {
      const h = new DailyNoteHistory(makeProvider())
      const before = makeBlocks('before')
      const after = makeBlocks('after')
      const selAfter = sel('b0', 5)
      h.add('2024-01-15', before, after, null, selAfter)
      h.undo()
      const result = h.redo()
      expect(result.noteId).toBe('2024-01-15')
      expect(result.blocks).toBe(after)
      expect(result.selection).toBe(selAfter)
    })

    it('calls provider.save with noteId and blocksAfter', () => {
      const provider = makeProvider()
      const h = new DailyNoteHistory(provider)
      const before = makeBlocks('old')
      const after = makeBlocks('new')
      h.add('2024-01-15', before, after, null, null)
      h.undo()
      h.redo()
      // undo called save with before, redo called save with after
      expect(provider.save).toHaveBeenLastCalledWith('2024-01-15', after.blocks)
    })

    it('canRedo becomes false after redo', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('a'), makeBlocks('b'), null, null)
      h.undo()
      h.redo()
      expect(h.canRedo()).toBe(false)
    })

    it('canUndo becomes true after redo', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('a'), makeBlocks('b'), null, null)
      h.undo()
      h.redo()
      expect(h.canUndo()).toBe(true)
    })
  })

  describe('redo stack cleared on add after undo', () => {
    it('new add after undo clears redo', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.add('2024-01-15', makeBlocks('a'), makeBlocks('b'), null, null)
      h.undo()
      h.add('2024-01-15', makeBlocks('a'), makeBlocks('c'), null, null)
      expect(h.canRedo()).toBe(false)
    })
  })

  describe('cross-day scenarios', () => {
    it('undo traverses entries across different notes in reverse order', () => {
      const h = new DailyNoteHistory(makeProvider())
      const dayA_before = makeBlocks('a-before')
      const dayA_after  = makeBlocks('a-after')
      const dayB_before = makeBlocks('b-before')
      const dayB_after  = makeBlocks('b-after')

      h.add('2024-01-15', dayA_before, dayA_after, null, null)
      h.add('2024-01-16', dayB_before, dayB_after, null, null)

      const r1 = h.undo()
      expect(r1.noteId).toBe('2024-01-16')
      expect(r1.blocks).toBe(dayB_before)

      const r2 = h.undo()
      expect(r2.noteId).toBe('2024-01-15')
      expect(r2.blocks).toBe(dayA_before)
    })

    it('redo applies changes to correct day after cross-day undo', () => {
      const h = new DailyNoteHistory(makeProvider())
      const dayA_before = makeBlocks('a-before')
      const dayA_after  = makeBlocks('a-after')
      const dayB_before = makeBlocks('b-before')
      const dayB_after  = makeBlocks('b-after')

      h.add('2024-01-15', dayA_before, dayA_after, null, null)
      h.add('2024-01-16', dayB_before, dayB_after, null, null)

      h.undo()  // undoes day B
      const r = h.redo()
      expect(r.noteId).toBe('2024-01-16')
      expect(r.blocks).toBe(dayB_after)
    })

    it('provider.save called with the correct noteId on cross-day undo', () => {
      const provider = makeProvider()
      const h = new DailyNoteHistory(provider)

      h.add('2024-01-15', makeBlocks('a'), makeBlocks('a2'), null, null)
      h.add('2024-01-16', makeBlocks('b'), makeBlocks('b2'), null, null)

      h.undo()
      expect(provider.save).toHaveBeenLastCalledWith('2024-01-16', expect.anything())
      h.undo()
      expect(provider.save).toHaveBeenLastCalledWith('2024-01-15', expect.anything())
    })
  })

  describe('updateOrAdd', () => {
    it('coalesces text changes for the same noteId and blockId', () => {
      const h = new DailyNoteHistory(makeProvider())
      const base = makeBlocks('')
      const mid  = makeBlocks('h')
      const end  = makeBlocks('he')

      h.updateOrAdd('2024-01-15', 'b0', base, mid, null, sel('b0', 1))
      h.updateOrAdd('2024-01-15', 'b0', mid, end, null, sel('b0', 2))

      // One entry — undo goes straight to base
      const r = h.undo()
      expect(r.blocks).toBe(base)
      expect(h.canUndo()).toBe(false)
    })

    it('coalescing preserves original selectionBefore', () => {
      const h = new DailyNoteHistory(makeProvider())
      const firstBefore = sel('b0', 0)
      h.updateOrAdd('2024-01-15', 'b0', makeBlocks(''), makeBlocks('h'), firstBefore, sel('b0', 1))
      h.updateOrAdd('2024-01-15', 'b0', makeBlocks('h'), makeBlocks('he'), sel('b0', 1), sel('b0', 2))

      const r = h.undo()
      expect(r.selection).toBe(firstBefore)
    })

    it('coalescing updates selectionAfter to the latest value', () => {
      const h = new DailyNoteHistory(makeProvider())
      const lastAfter = sel('b0', 2)
      h.updateOrAdd('2024-01-15', 'b0', makeBlocks(''), makeBlocks('h'), null, sel('b0', 1))
      h.updateOrAdd('2024-01-15', 'b0', makeBlocks('h'), makeBlocks('he'), null, lastAfter)

      h.undo()
      const r = h.redo()
      expect(r.selection).toBe(lastAfter)
    })

    it('does not coalesce when noteId differs', () => {
      const h = new DailyNoteHistory(makeProvider())
      h.updateOrAdd('2024-01-15', 'b0', makeBlocks('a'), makeBlocks('ab'), null, null)
      h.updateOrAdd('2024-01-16', 'b0', makeBlocks('x'), makeBlocks('xy'), null, null)

      // Two separate entries
      h.undo()
      expect(h.canUndo()).toBe(true)
    })

    it('does not coalesce when blockId differs', () => {
      const h = new DailyNoteHistory(makeProvider())
      const blocksAB = Blocks.from([
        new TextBlock('b0', new Text('a', []), []),
        new TextBlock('b1', new Text('x', []), []),
      ])
      const blocksAB2 = Blocks.from([
        new TextBlock('b0', new Text('ab', []), []),
        new TextBlock('b1', new Text('x', []), []),
      ])
      const blocksAB3 = Blocks.from([
        new TextBlock('b0', new Text('ab', []), []),
        new TextBlock('b1', new Text('xy', []), []),
      ])

      h.updateOrAdd('2024-01-15', 'b0', blocksAB, blocksAB2, null, null)
      h.updateOrAdd('2024-01-15', 'b1', blocksAB2, blocksAB3, null, null)

      h.undo()
      expect(h.canUndo()).toBe(true)
    })
  })

  describe('MAX_DEPTH cap', () => {
    it('oldest entry is dropped when MAX_DEPTH is exceeded', () => {
      const h = new DailyNoteHistory(makeProvider())
      for (let i = 0; i <= DailyNoteHistory.MAX_DEPTH; i++) {
        h.add('2024-01-15', makeBlocks(`step${i}`), makeBlocks(`step${i + 1}`), null, null)
      }
      expect(h.canUndo()).toBe(true)
      expect(h.canRedo()).toBe(false)
      for (let i = 0; i < DailyNoteHistory.MAX_DEPTH; i++) {
        h.undo()
      }
      expect(h.canUndo()).toBe(false)
    })
  })
})
