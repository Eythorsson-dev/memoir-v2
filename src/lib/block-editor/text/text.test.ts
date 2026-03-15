import { describe, it, expect } from 'vitest'
import { Text } from './text'

// ─── Constructor invariants ───────────────────────────────────────────────────

describe('Text constructor – valid inputs', () => {
  it('creates a Text instance with no inlines', () => {
    const t = new Text('hello', [])
    expect(t.text).toBe('hello')
    expect(t.inline).toEqual([])
  })

  it('allows empty string with no inlines', () => {
    const t = new Text('', [])
    expect(t.text).toBe('')
    expect(t.inline).toEqual([])
  })

  it('accepts valid inline that covers the full text', () => {
    const t = new Text('hi', [{ type: 'Bold', start: 0, end: 2 }])
    expect(t.inline).toHaveLength(1)
  })

  it('auto-sorts inline by start asc, then end desc', () => {
    // Bold[0,4] and Bold[6,11] do not touch; Italic[0,8] overlaps with both (allowed for different types)
    const t = new Text('hello world', [
      { type: 'Bold', start: 6, end: 11 },
      { type: 'Italic', start: 0, end: 8 },
      { type: 'Bold', start: 0, end: 4 },
    ])
    // start 0 comes before start 6; among start=0: end=8 > end=4 so Italic first
    expect(t.inline[0]).toMatchObject({ type: 'Italic', start: 0, end: 8 })
    expect(t.inline[1]).toMatchObject({ type: 'Bold', start: 0, end: 4 })
    expect(t.inline[2]).toMatchObject({ type: 'Bold', start: 6, end: 11 })
  })
})

describe('Text constructor – invariant violations', () => {
  it('throws when start < 0', () => {
    expect(() => new Text('hello', [{ type: 'Bold', start: -1, end: 3 }])).toThrow()
  })

  it('throws when end <= start (end === start)', () => {
    expect(() => new Text('hello', [{ type: 'Bold', start: 2, end: 2 }])).toThrow()
  })

  it('throws when end < start', () => {
    expect(() => new Text('hello', [{ type: 'Bold', start: 4, end: 2 }])).toThrow()
  })

  it('throws when end > text.length', () => {
    expect(() => new Text('hello', [{ type: 'Bold', start: 0, end: 6 }])).toThrow()
  })

  it('throws when same-type inlines overlap', () => {
    expect(() =>
      new Text('hello world', [
        { type: 'Bold', start: 0, end: 7 },
        { type: 'Bold', start: 5, end: 10 },
      ])
    ).toThrow()
  })

  it('throws when same-type inlines touch (end of one === start of other)', () => {
    expect(() =>
      new Text('hello world', [
        { type: 'Bold', start: 0, end: 5 },
        { type: 'Bold', start: 5, end: 11 },
      ])
    ).toThrow()
  })

  it('does NOT throw when different-type inlines overlap', () => {
    expect(() =>
      new Text('hello world', [
        { type: 'Bold', start: 0, end: 7 },
        { type: 'Italic', start: 5, end: 11 },
      ])
    ).not.toThrow()
  })
})

// ─── JSON serialization ───────────────────────────────────────────────────────

describe('Text JSON serialization', () => {
  it('JSON.stringify returns only TextDto fields', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    const parsed = JSON.parse(JSON.stringify(t))
    const keys = Object.keys(parsed)
    expect(keys).toEqual(expect.arrayContaining(['text', 'inline']))
    expect(keys).toHaveLength(2)
  })

  it('serialized inline array matches input', () => {
    const inlines = [{ type: 'Bold' as const, start: 0, end: 5 }]
    const t = new Text('hello', inlines)
    const parsed: { text: string; inline: unknown[] } = JSON.parse(JSON.stringify(t))
    expect(parsed.text).toBe('hello')
    expect(parsed.inline).toEqual(inlines)
  })
})

// ─── isToggled ────────────────────────────────────────────────────────────────

describe('isToggled', () => {
  it('returns true when a single inline covers the exact range', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    expect(t.isToggled('Bold', 0, 5)).toBe(true)
  })

  it('returns true when the inline covers more than the queried range', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 11 }])
    expect(t.isToggled('Bold', 2, 8)).toBe(true)
  })

  it('returns false when no inline of that type exists', () => {
    const t = new Text('hello', [])
    expect(t.isToggled('Bold', 0, 5)).toBe(false)
  })

  it('returns false when the inline only partially covers the range', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 5 }])
    expect(t.isToggled('Bold', 0, 11)).toBe(false)
  })

  it('returns false when a different type covers the range', () => {
    const t = new Text('hello', [{ type: 'Italic', start: 0, end: 5 }])
    expect(t.isToggled('Bold', 0, 5)).toBe(false)
  })

  it('throws if start < 0', () => {
    const t = new Text('hello', [])
    expect(() => t.isToggled('Bold', -1, 3)).toThrow()
  })

  it('throws if end <= start', () => {
    const t = new Text('hello', [])
    expect(() => t.isToggled('Bold', 2, 2)).toThrow()
  })

  it('throws if end > text.length', () => {
    const t = new Text('hello', [])
    expect(() => t.isToggled('Bold', 0, 6)).toThrow()
  })
})

// ─── addInline ────────────────────────────────────────────────────────────────

describe('addInline', () => {
  it('adds a new inline to empty text', () => {
    const t = new Text('hello', [])
    const t2 = t.addInline('Bold', 0, 5)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 0, end: 5 }])
  })

  it('returns a new Text instance (immutable)', () => {
    const t = new Text('hello', [])
    const t2 = t.addInline('Bold', 0, 5)
    expect(t2).not.toBe(t)
    expect(t.inline).toHaveLength(0)
  })

  it('merges overlapping same-type inline', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 6 }])
    const t2 = t.addInline('Bold', 4, 11)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 0, end: 11 }])
  })

  it('merges touching same-type inline', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 5 }])
    const t2 = t.addInline('Bold', 5, 11)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 0, end: 11 }])
  })

  it('merges multiple same-type inlines across the new range', () => {
    // Plan example: existing Bold[5,15], Bold[20,30]; adding Bold[15,35]
    const t = new Text('0123456789012345678901234567890123456789', [
      { type: 'Bold', start: 5, end: 15 },
      { type: 'Bold', start: 20, end: 30 },
    ])
    const t2 = t.addInline('Bold', 15, 35)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 5, end: 35 }])
  })

  it('does not merge non-adjacent same-type inlines', () => {
    const t = new Text('hello world!', [{ type: 'Bold', start: 0, end: 3 }])
    const t2 = t.addInline('Bold', 7, 12)
    expect(t2.inline).toHaveLength(2)
    expect(t2.inline[0]).toMatchObject({ type: 'Bold', start: 0, end: 3 })
    expect(t2.inline[1]).toMatchObject({ type: 'Bold', start: 7, end: 12 })
  })

  it('does not merge different-type inlines', () => {
    const t = new Text('hello world', [{ type: 'Italic', start: 0, end: 11 }])
    const t2 = t.addInline('Bold', 0, 11)
    expect(t2.inline).toHaveLength(2)
  })

  it('throws if start < 0', () => {
    const t = new Text('hello', [])
    expect(() => t.addInline('Bold', -1, 5)).toThrow()
  })

  it('throws if end <= start', () => {
    const t = new Text('hello', [])
    expect(() => t.addInline('Bold', 3, 3)).toThrow()
  })

  it('throws if end > text.length', () => {
    const t = new Text('hello', [])
    expect(() => t.addInline('Bold', 0, 6)).toThrow()
  })
})

// ─── removeInline ─────────────────────────────────────────────────────────────

describe('removeInline', () => {
  it('removes an inline that is fully contained in the range', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 2, end: 7 }])
    const t2 = t.removeInline('Bold', 0, 11)
    expect(t2.inline).toEqual([])
  })

  it('returns a new Text instance (immutable)', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    const t2 = t.removeInline('Bold', 0, 5)
    expect(t2).not.toBe(t)
  })

  it('trims start of inline when remove range overlaps from left', () => {
    // existing Bold[3,18], removeInline Bold[5,20]: keeps [3,5)
    const t = new Text('01234567890123456789', [{ type: 'Bold', start: 3, end: 18 }])
    const t2 = t.removeInline('Bold', 5, 20)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 3, end: 5 }])
  })

  it('trims end of inline when remove range overlaps from right', () => {
    // existing Bold[5,15], removeInline Bold[3,10]: keeps [10,15)
    const t = new Text('0123456789012345', [{ type: 'Bold', start: 5, end: 15 }])
    const t2 = t.removeInline('Bold', 3, 10)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 10, end: 15 }])
  })

  it('splits inline into two when remove range is strictly inside', () => {
    // existing Bold[2,10], removeInline Bold[4,7]: keeps [2,4) and [7,10)
    const t = new Text('0123456789', [{ type: 'Bold', start: 2, end: 10 }])
    const t2 = t.removeInline('Bold', 4, 7)
    expect(t2.inline).toHaveLength(2)
    expect(t2.inline[0]).toMatchObject({ type: 'Bold', start: 2, end: 4 })
    expect(t2.inline[1]).toMatchObject({ type: 'Bold', start: 7, end: 10 })
  })

  it('does not affect non-overlapping inlines', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 4 }])
    const t2 = t.removeInline('Bold', 6, 11)
    expect(t2.inline).toEqual([{ type: 'Bold', start: 0, end: 4 }])
  })

  it('does not affect different-type inlines', () => {
    const t = new Text('hello world', [{ type: 'Italic', start: 0, end: 11 }])
    const t2 = t.removeInline('Bold', 0, 11)
    expect(t2.inline).toEqual([{ type: 'Italic', start: 0, end: 11 }])
  })

  it('does not modify the text string', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 11 }])
    const t2 = t.removeInline('Bold', 0, 11)
    expect(t2.text).toBe('hello world')
  })

  it('throws if start < 0', () => {
    const t = new Text('hello', [])
    expect(() => t.removeInline('Bold', -1, 3)).toThrow()
  })

  it('throws if end <= start', () => {
    const t = new Text('hello', [])
    expect(() => t.removeInline('Bold', 2, 2)).toThrow()
  })

  it('throws if end > text.length', () => {
    const t = new Text('hello', [])
    expect(() => t.removeInline('Bold', 0, 6)).toThrow()
  })
})

// ─── split ────────────────────────────────────────────────────────────────────

describe('split', () => {
  it('split(0) returns empty left and full right as new instances', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 1, end: 4 }])
    const [left, right] = t.split(0)
    expect(left.text).toBe('')
    expect(left.inline).toEqual([])
    expect(right.text).toBe('hello')
    expect(right.inline).toEqual([{ type: 'Bold', start: 1, end: 4 }])
    expect(left).not.toBe(t)
    expect(right).not.toBe(t)
  })

  it('split(text.length) returns full left and empty right as new instances', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 1, end: 4 }])
    const [left, right] = t.split(5)
    expect(left.text).toBe('hello')
    expect(left.inline).toEqual([{ type: 'Bold', start: 1, end: 4 }])
    expect(right.text).toBe('')
    expect(right.inline).toEqual([])
    expect(left).not.toBe(t)
    expect(right).not.toBe(t)
  })

  it('splits text string at offset', () => {
    const t = new Text('hello world', [])
    const [left, right] = t.split(5)
    expect(left.text).toBe('hello')
    expect(right.text).toBe(' world')
  })

  it('inline entirely left of offset goes to left unchanged', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 3 }])
    const [left, right] = t.split(5)
    expect(left.inline).toEqual([{ type: 'Bold', start: 0, end: 3 }])
    expect(right.inline).toEqual([])
  })

  it('inline entirely right of offset goes to right with shifted offsets', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 6, end: 11 }])
    const [left, right] = t.split(5)
    expect(left.inline).toEqual([])
    expect(right.inline).toEqual([{ type: 'Bold', start: 1, end: 6 }])
  })

  it('inline touching boundary from left (end == offset) goes entirely to left', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 2, end: 5 }])
    const [left, right] = t.split(5)
    expect(left.inline).toEqual([{ type: 'Bold', start: 2, end: 5 }])
    expect(right.inline).toEqual([])
  })

  it('inline touching boundary from right (start == offset) goes entirely to right', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 5, end: 9 }])
    const [left, right] = t.split(5)
    expect(left.inline).toEqual([])
    expect(right.inline).toEqual([{ type: 'Bold', start: 0, end: 4 }])
  })

  it('inline spanning boundary is split into both halves', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 2, end: 8 }])
    const [left, right] = t.split(5)
    expect(left.inline).toEqual([{ type: 'Bold', start: 2, end: 5 }])
    expect(right.inline).toEqual([{ type: 'Bold', start: 0, end: 3 }])
  })

  it('plan example: inline [2,8) split at offsets 1,2,4,8', () => {
    const t = new Text('0123456789', [{ type: 'Bold', start: 2, end: 8 }])

    const [l1, r1] = t.split(1)
    expect(l1.inline).toEqual([])
    expect(r1.inline).toEqual([{ type: 'Bold', start: 1, end: 7 }])

    const [l2, r2] = t.split(2)
    expect(l2.inline).toEqual([])
    expect(r2.inline).toEqual([{ type: 'Bold', start: 0, end: 6 }])

    const [l4, r4] = t.split(4)
    expect(l4.inline).toEqual([{ type: 'Bold', start: 2, end: 4 }])
    expect(r4.inline).toEqual([{ type: 'Bold', start: 0, end: 4 }])

    const [l8, r8] = t.split(8)
    expect(l8.inline).toEqual([{ type: 'Bold', start: 2, end: 8 }])
    expect(r8.inline).toEqual([])
  })

  it('throws if offset < 0', () => {
    const t = new Text('hello', [])
    expect(() => t.split(-1)).toThrow(RangeError)
  })

  it('throws if offset > text.length', () => {
    const t = new Text('hello', [])
    expect(() => t.split(6)).toThrow(RangeError)
  })
})

// ─── merge ────────────────────────────────────────────────────────────────────

describe('Text.merge', () => {
  it('concatenates text strings', () => {
    const left = new Text('hello', [])
    const right = new Text(' world', [])
    expect(Text.merge(left, right).text).toBe('hello world')
  })

  it('keeps left inlines unchanged', () => {
    const left = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    const right = new Text(' world', [])
    const merged = Text.merge(left, right)
    expect(merged.inline).toContainEqual({ type: 'Bold', start: 0, end: 5 })
  })

  it('shifts right inlines by left.text.length', () => {
    const left = new Text('hello', [])
    const right = new Text(' world', [{ type: 'Italic', start: 1, end: 6 }])
    const merged = Text.merge(left, right)
    expect(merged.inline).toContainEqual({ type: 'Italic', start: 6, end: 11 })
  })

  it('merges touching same-type inlines at the join boundary', () => {
    const left = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    const right = new Text(' world', [{ type: 'Bold', start: 0, end: 6 }])
    const merged = Text.merge(left, right)
    expect(merged.inline).toEqual([{ type: 'Bold', start: 0, end: 11 }])
  })

  it('merge is the inverse of split', () => {
    const original = new Text('hello world', [{ type: 'Bold', start: 2, end: 8 }])
    const [left, right] = original.split(5)
    const merged = Text.merge(left, right)
    expect(merged.text).toBe(original.text)
    expect(merged.inline).toEqual(original.inline)
  })

  it('merging with empty Text returns equivalent value', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    const empty = new Text('', [])
    expect(Text.merge(t, empty).text).toBe('hello')
    expect(Text.merge(t, empty).inline).toEqual(t.inline)
    expect(Text.merge(empty, t).text).toBe('hello')
    expect(Text.merge(empty, t).inline).toEqual(t.inline)
  })
})

// ─── remove ───────────────────────────────────────────────────────────────────

describe('remove', () => {
  it('removes characters from text string', () => {
    const t = new Text('hello world', [])
    expect(t.remove(5, 6).text).toBe('hello')
  })

  it('removes characters in the middle', () => {
    const t = new Text('hello world', [])
    expect(t.remove(5, 1).text).toBe('helloworld')
  })

  it('inline entirely before removed range is unchanged', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 3 }])
    expect(t.remove(5, 6).inline).toEqual([{ type: 'Bold', start: 0, end: 3 }])
  })

  it('inline entirely after removed range is shifted left', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 6, end: 11 }])
    expect(t.remove(0, 6).inline).toEqual([{ type: 'Bold', start: 0, end: 5 }])
  })

  it('inline entirely within removed range is dropped', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 6, end: 9 }])
    expect(t.remove(5, 6).inline).toEqual([])
  })

  it('inline spanning the entire removed range is shortened', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 3, end: 11 }])
    expect(t.remove(5, 3).inline).toEqual([{ type: 'Bold', start: 3, end: 8 }])
  })

  it('inline overlapping left boundary only is trimmed on the right', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 3, end: 7 }])
    expect(t.remove(5, 6).inline).toEqual([{ type: 'Bold', start: 3, end: 5 }])
  })

  it('inline overlapping right boundary only is shifted and trimmed on left', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 4, end: 9 }])
    expect(t.remove(2, 4).inline).toEqual([{ type: 'Bold', start: 2, end: 5 }])
  })

  it('touching inlines merge after removal closes the gap', () => {
    // Bold[5,10) and Bold[15,25), remove(10,5) → Bold[5,10) and Bold[10,20) → merged Bold[5,20)
    const t = new Text('0123456789012345678901234', [
      { type: 'Bold', start: 5, end: 10 },
      { type: 'Bold', start: 15, end: 25 },
    ])
    const result = t.remove(10, 5)
    expect(result.inline).toEqual([{ type: 'Bold', start: 5, end: 20 }])
  })

  it('throws if offset < 0', () => {
    const t = new Text('hello', [])
    expect(() => t.remove(-1, 2)).toThrow(RangeError)
  })

  it('throws if length <= 0', () => {
    const t = new Text('hello', [])
    expect(() => t.remove(0, 0)).toThrow(RangeError)
    expect(() => t.remove(0, -1)).toThrow(RangeError)
  })

  it('throws if offset + length > text.length', () => {
    const t = new Text('hello', [])
    expect(() => t.remove(3, 3)).toThrow(RangeError)
  })
})
