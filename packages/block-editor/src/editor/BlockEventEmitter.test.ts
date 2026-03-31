import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BlockEventEmitter } from './BlockEventEmitter'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEmitter(debounceMs = 1000, maxWaitMs = 10000): BlockEventEmitter {
  return new BlockEventEmitter(
    (id) => ({ id, data: new Text('test', []), blockType: 'text' as const }),
    { debounceMs, maxWaitMs },
  )
}

// ─── addEventListener / unsubscribe ───────────────────────────────────────────

describe('addEventListener / unsubscribe', () => {
  it('calls handler when event is emitted', () => {
    const emitter = makeEmitter()
    const events: string[] = []
    emitter.addEventListener('blockCreated', (e) => events.push(e.id))
    emitter.emit('blockCreated', {
      id: 'a',
      blockType: 'text',
      data: new Text('', []),
      previousBlockId: null,
      parentBlockId: null,
    })
    expect(events).toEqual(['a'])
  })

  it('unsubscribe stops future calls', () => {
    const emitter = makeEmitter()
    const events: string[] = []
    const unsub = emitter.addEventListener('blockCreated', (e) => events.push(e.id))
    unsub()
    emitter.emit('blockCreated', {
      id: 'a',
      blockType: 'text',
      data: new Text('', []),
      previousBlockId: null,
      parentBlockId: null,
    })
    expect(events).toHaveLength(0)
  })

  it('multiple listeners on same event all receive the payload', () => {
    const emitter = makeEmitter()
    const a: string[] = []
    const b: string[] = []
    emitter.addEventListener('blockRemoved', (e) => a.push(e.id))
    emitter.addEventListener('blockRemoved', (e) => b.push(e.id))
    emitter.emit('blockRemoved', { id: 'x' })
    expect(a).toEqual(['x'])
    expect(b).toEqual(['x'])
  })

  it('unsubscribing one listener does not affect others', () => {
    const emitter = makeEmitter()
    const a: string[] = []
    const b: string[] = []
    const unsub = emitter.addEventListener('blockRemoved', (e) => a.push(e.id))
    emitter.addEventListener('blockRemoved', (e) => b.push(e.id))
    unsub()
    emitter.emit('blockRemoved', { id: 'x' })
    expect(a).toHaveLength(0)
    expect(b).toEqual(['x'])
  })
})

// ─── emit dispatches correctly ────────────────────────────────────────────────

describe('emit', () => {
  it('dispatches selectionChange with null payload', () => {
    const emitter = makeEmitter()
    const received: Array<unknown> = []
    emitter.addEventListener('selectionChange', (s) => received.push(s))
    emitter.emit('selectionChange', null)
    expect(received).toEqual([null])
  })

  it('no-op when no listeners for the event', () => {
    const emitter = makeEmitter()
    // Should not throw
    expect(() => emitter.emit('blockRemoved', { id: 'x' })).not.toThrow()
  })
})

// ─── scheduleDataUpdated debouncing ───────────────────────────────────────────

describe('scheduleDataUpdated', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not fire immediately', () => {
    const emitter = makeEmitter(1000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    expect(events).toHaveLength(0)
  })

  it('fires after debounceMs', () => {
    const emitter = makeEmitter(1000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    vi.advanceTimersByTime(1000)
    expect(events).toEqual(['a'])
  })

  it('fires after maxWaitMs during continuous scheduling', () => {
    const emitter = makeEmitter(1000, 3000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    for (let i = 0; i < 4; i++) {
      emitter.scheduleDataUpdated('a')
      vi.advanceTimersByTime(800)
    }
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  it('debounce resets on repeated schedule calls within delay', () => {
    const emitter = makeEmitter(1000, 10000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    vi.advanceTimersByTime(500)
    emitter.scheduleDataUpdated('a')  // reset timer
    vi.advanceTimersByTime(500)
    expect(events).toHaveLength(0)
    vi.advanceTimersByTime(500)
    expect(events).toHaveLength(1)
  })
})

// ─── flushDataUpdated ─────────────────────────────────────────────────────────

describe('flushDataUpdated', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires the pending event immediately', () => {
    const emitter = makeEmitter(1000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    emitter.flushDataUpdated('a')
    expect(events).toEqual(['a'])
  })

  it('no-op when nothing pending for that id', () => {
    const emitter = makeEmitter()
    expect(() => emitter.flushDataUpdated('missing')).not.toThrow()
  })
})

// ─── cancelDataUpdated ────────────────────────────────────────────────────────

describe('cancelDataUpdated', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('prevents the scheduled event from firing', () => {
    const emitter = makeEmitter(1000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    emitter.cancelDataUpdated('a')
    vi.advanceTimersByTime(2000)
    expect(events).toHaveLength(0)
  })

  it('no-op when nothing pending for that id', () => {
    const emitter = makeEmitter()
    expect(() => emitter.cancelDataUpdated('missing')).not.toThrow()
  })
})

// ─── flushAll / cancelAll ─────────────────────────────────────────────────────

describe('flushAll', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('flushes all pending data-update events synchronously', () => {
    const emitter = makeEmitter(1000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    emitter.scheduleDataUpdated('b')
    emitter.flushAll()
    expect(events).toContain('a')
    expect(events).toContain('b')
  })
})

describe('cancelAll', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cancels all pending data-update events', () => {
    const emitter = makeEmitter(1000)
    const events: string[] = []
    emitter.addEventListener('blockDataUpdated', (e) => events.push(e.id))
    emitter.scheduleDataUpdated('a')
    emitter.scheduleDataUpdated('b')
    emitter.cancelAll()
    vi.advanceTimersByTime(2000)
    expect(events).toHaveLength(0)
  })
})
