import { describe, it, expect } from 'vitest'
import { InputRules } from './InputRules'

describe('InputRules.match', () => {
  it('returns unordered-list match for "- " at cursor offset 2 on text block', () => {
    expect(InputRules.match('- ', 2, 'text')).toEqual({ targetType: 'unordered-list', stripLength: 2 })
  })

  it('returns unordered-list match for "* " at cursor offset 2 on text block', () => {
    expect(InputRules.match('* ', 2, 'text')).toEqual({ targetType: 'unordered-list', stripLength: 2 })
  })

  it('returns ordered-list match for "1. " at cursor offset 3 on text block', () => {
    expect(InputRules.match('1. ', 3, 'text')).toEqual({ targetType: 'ordered-list', stripLength: 3 })
  })

  it('returns null for "- " when block is already unordered-list', () => {
    expect(InputRules.match('- ', 2, 'unordered-list')).toBeNull()
  })

  it('returns null for "1. " when block is already ordered-list', () => {
    expect(InputRules.match('1. ', 3, 'ordered-list')).toBeNull()
  })

  it('allows cross-type: "- " on ordered-list → unordered-list', () => {
    expect(InputRules.match('- ', 2, 'ordered-list')).toEqual({ targetType: 'unordered-list', stripLength: 2 })
  })

  it('allows cross-type: "1. " on unordered-list → ordered-list', () => {
    expect(InputRules.match('1. ', 3, 'unordered-list')).toEqual({ targetType: 'ordered-list', stripLength: 3 })
  })

  it('ignores "- " when cursor is at offset 1 (space not yet inserted)', () => {
    expect(InputRules.match('- ', 1, 'text')).toBeNull()
  })

  it('ignores "2. " — only "1." triggers ordered list', () => {
    expect(InputRules.match('2. ', 3, 'text')).toBeNull()
  })

  it('matches "- Hello" at cursor offset 2 — content after marker is irrelevant', () => {
    expect(InputRules.match('- Hello', 2, 'text')).toEqual({ targetType: 'unordered-list', stripLength: 2 })
  })
})
