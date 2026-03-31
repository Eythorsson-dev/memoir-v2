import type { BlockTypes } from '../blocks/blocks'
import type { HeaderLevel } from '../blocks/blocks'

export interface ListInputRuleMatch {
  targetType: Extract<BlockTypes, 'ordered-list' | 'unordered-list'>
  stripLength: number
}

export interface HeaderInputRuleMatch {
  targetType: 'header'
  headerLevel: HeaderLevel
  stripLength: number
}

export type InputRuleMatch = ListInputRuleMatch | HeaderInputRuleMatch

/**
 * Pure pattern-matching logic for markdown-style input shortcuts.
 * Has no DOM dependency and no side effects — all detection lives here.
 *
 * Supported triggers (all fire when Space is pressed):
 * - `- ` or `* ` at cursor offset 2 → unordered-list
 * - `1. ` at cursor offset 3 → ordered-list
 * - `# ` at cursor offset 2 → header level 1
 * - `## ` at cursor offset 3 → header level 2
 * - `### ` at cursor offset 4 → header level 3
 *
 * @remarks
 * `cursorOffset` is the offset AFTER the space has been inserted (i.e.
 * as seen in the `input` event). For `- `, the space lands at index 1 so
 * the cursor arrives at offset 2.
 *
 * Cross-type conversions (ordered → unordered and vice-versa) are allowed.
 * Same-type list conversions are silently ignored (returns `null`).
 * Header shortcuts always fire — re-triggering on an existing header allows
 * the user to change the level by editing the prefix.
 */
export class InputRules {
  static match(
    text: string,
    cursorOffset: number,
    currentType: BlockTypes,
  ): InputRuleMatch | null {
    if (cursorOffset === 2 && (text.startsWith('- ') || text.startsWith('* '))) {
      if (currentType === 'unordered-list') return null
      return { targetType: 'unordered-list', stripLength: 2 }
    }
    if (cursorOffset === 3 && text.startsWith('1. ')) {
      if (currentType === 'ordered-list') return null
      return { targetType: 'ordered-list', stripLength: 3 }
    }
    if (cursorOffset === 2 && text.startsWith('# ')) {
      return { targetType: 'header', headerLevel: 1, stripLength: 2 }
    }
    if (cursorOffset === 3 && text.startsWith('## ')) {
      return { targetType: 'header', headerLevel: 2, stripLength: 3 }
    }
    if (cursorOffset === 4 && text.startsWith('### ')) {
      return { targetType: 'header', headerLevel: 3, stripLength: 4 }
    }
    return null
  }
}
