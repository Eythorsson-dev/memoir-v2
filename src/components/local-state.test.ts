import { describe, it, expect, afterEach } from 'vitest'
import { localState } from './local-state.svelte'

describe('localState', () => {
  afterEach(() => localStorage.clear())

  it('returns the default when localStorage is unavailable (SSR)', () => {
    const orig = (globalThis as any).localStorage
    delete (globalThis as any).localStorage
    try {
      expect(localState('k', true).value).toBe(true)
      expect(localState('k', false).value).toBe(false)
      expect(localState('k', 42).value).toBe(42)
    } finally {
      ;(globalThis as any).localStorage = orig
    }
  })

  it('returns the default when key has never been set', () => {
    expect(localState('k', true).value).toBe(true)
    expect(localState('k', 7).value).toBe(7)
  })

  it('returns the stored value when key exists', () => {
    localStorage.setItem('k', JSON.stringify(false))
    expect(localState('k', true).value).toBe(false)
  })

  it('falls back to the default when stored JSON is corrupt', () => {
    localStorage.setItem('k', 'not-json{{')
    expect(localState('k', true).value).toBe(true)
  })
})
