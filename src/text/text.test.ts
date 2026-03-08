import { describe, it, expect } from 'vitest'
import { Text } from './text'

// ─── Constructor invariants ───────────────────────────────────────────────────

describe('Text constructor – valid inputs', () => {
  it('creates a Text instance with no inlines', () => {
    const t = new Text('hello', [])
    expect(t.text).toBe('hello')
    expect(t.inline).toEqual([])
  })

  it('accepts valid inline that covers the full text', () => {
    const t = new Text('hi', [{ type: 'Bold', start: 0, end: 2 }])
    expect(t.inline).toHaveLength(1)
  })

  it('auto-sorts inline by start asc, then end desc', () => {
    const t = new Text('hello world', [
      { type: 'Bold', start: 5, end: 10 },
      { type: 'Italic', start: 0, end: 8 },
      { type: 'Bold', start: 0, end: 5 },
    ])
    // start 0 comes before start 5; among start=0: end=8 > end=5 so Italic first
    expect(t.inline[0]).toMatchObject({ type: 'Italic', start: 0, end: 8 })
    expect(t.inline[1]).toMatchObject({ type: 'Bold', start: 0, end: 5 })
    expect(t.inline[2]).toMatchObject({ type: 'Bold', start: 5, end: 10 })
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
