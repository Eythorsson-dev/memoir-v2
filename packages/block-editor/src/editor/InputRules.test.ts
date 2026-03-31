import { describe, it, expect } from 'vitest'
import { InputRules, type HeaderInputRuleMatch } from './InputRules'

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

describe('InputRules.match — heading shortcuts', () => {
  it('matches "# " at offset 2 on text → header level 1, stripLength 2', () => {
    const match = InputRules.match('# ', 2, 'text') as HeaderInputRuleMatch
    expect(match).not.toBeNull()
    expect(match.targetType).toBe('header')
    expect(match.headerLevel).toBe(1)
    expect(match.stripLength).toBe(2)
  })

  it('matches "## " at offset 3 → header level 2, stripLength 3', () => {
    const match = InputRules.match('## ', 3, 'text') as HeaderInputRuleMatch
    expect(match?.targetType).toBe('header')
    expect(match?.headerLevel).toBe(2)
    expect(match?.stripLength).toBe(3)
  })

  it('matches "### " at offset 4 → header level 3, stripLength 4', () => {
    const match = InputRules.match('### ', 4, 'text') as HeaderInputRuleMatch
    expect(match?.targetType).toBe('header')
    expect(match?.headerLevel).toBe(3)
    expect(match?.stripLength).toBe(4)
  })

  it('does not match "#### " — four hashes exceed max level', () => {
    expect(InputRules.match('#### ', 5, 'text')).toBeNull()
  })

  it('re-triggers on an existing H1 block (unlike same-type list no-op)', () => {
    const match = InputRules.match('# ', 2, 'header') as HeaderInputRuleMatch
    expect(match).not.toBeNull()
    expect(match.headerLevel).toBe(1)
  })

  it('re-triggers on an existing H1 to promote to H2', () => {
    const match = InputRules.match('## ', 3, 'header') as HeaderInputRuleMatch
    expect(match).not.toBeNull()
    expect(match.headerLevel).toBe(2)
  })
})
