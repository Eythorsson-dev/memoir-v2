import { Text, type InlineTypes } from '../text/text'
import { textSerializer } from '../text/serializer'
import { createElement, Bold, Italic, Underline } from 'lucide'
import './text-editor.css'

// ─── Selection helpers ────────────────────────────────────────────────────────

/**
 * Returns the character offset of `targetOffset` within `targetNode`,
 * counted from the start of `root` using only text nodes.
 * Returns -1 if `targetNode` is not found within `root`.
 */
function getCharOffset(root: Node, targetNode: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = 0

  let node: Node | null = walker.nextNode()
  while (node !== null) {
    if (node === targetNode) {
      return offset + targetOffset
    }
    offset += (node.textContent ?? '').length
    node = walker.nextNode()
  }

  // targetNode not found — may be the root itself at offset 0
  if (targetNode === root) return targetOffset
  return -1
}

/**
 * Finds the text node and local offset corresponding to a character offset
 * within `root`.
 */
function findNodeAtOffset(root: Node, targetOffset: number): { node: globalThis.Text; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let accumulated = 0

  let node: Node | null = walker.nextNode()
  while (node !== null) {
    const len = (node.textContent ?? '').length
    if (accumulated + len >= targetOffset) {
      return { node: node as globalThis.Text, offset: targetOffset - accumulated }
    }
    accumulated += len
    node = walker.nextNode()
  }

  // Fallback: end of last text node (or root itself)
  const last = walker.currentNode
  if (last && last.nodeType === Node.TEXT_NODE) {
    return { node: last as globalThis.Text, offset: (last.textContent ?? '').length }
  }

  // Empty editable — return a synthetic position
  return { node: root as unknown as globalThis.Text, offset: 0 }
}

// ─── TextEditor ───────────────────────────────────────────────────────────────

export class TextEditor {
  private _state: Text
  private _editable: HTMLDivElement
  private _toolbar: HTMLDivElement
  private _listeners: Set<(t: Text) => void> = new Set()
  private _composing = false

  private _buttons: Map<InlineTypes, HTMLButtonElement> = new Map()

  constructor(container: HTMLElement, initial?: Text) {
    this._state = initial ?? new Text('', [])

    // Build toolbar
    this._toolbar = document.createElement('div')
    this._toolbar.className = 'text-editor-toolbar'

    const buttonDefs: { type: InlineTypes; icon: Parameters<typeof createElement>[0] }[] = [
      { type: 'Bold', icon: Bold },
      { type: 'Italic', icon: Italic },
      { type: 'Underline', icon: Underline },
    ]

    for (const { type, icon } of buttonDefs) {
      const btn = document.createElement('button')
      btn.appendChild(createElement(icon))
      btn.ariaLabel = type
      btn.dataset.inlineType = type
      // Use mousedown + preventDefault to keep focus in editable
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this._applyOrRemoveInline(type)
      })
      this._toolbar.appendChild(btn)
      this._buttons.set(type, btn)
    }

    // Build editable
    this._editable = document.createElement('div')
    this._editable.className = 'text-editor-editable'
    this._editable.contentEditable = 'true'

    this._editable.addEventListener('input', () => {
      if (!this._composing) this._handleInput()
    })
    this._editable.addEventListener('compositionstart', () => {
      this._composing = true
    })
    this._editable.addEventListener('compositionend', () => {
      this._composing = false
      this._handleInput()
    })

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this._editable) {
        this._updateToolbarState()
      }
    })

    container.appendChild(this._toolbar)
    container.appendChild(this._editable)

    this._render()
  }

  getValue(): Text {
    return this._state
  }

  setValue(text: Text): void {
    this._state = text
    this._render()
    this._notify()
  }

  /** Registers a change listener. Returns an unsubscribe function. */
  onChange(cb: (text: Text) => void): () => void {
    this._listeners.add(cb)
    return () => this._listeners.delete(cb)
  }

  destroy(): void {
    this._toolbar.remove()
    this._editable.remove()
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _notify(): void {
    for (const cb of this._listeners) cb(this._state)
  }

  private _getSelectionOffsets(): { start: number; end: number } | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)

    // Guard: selection must be within the editable
    if (!this._editable.contains(range.startContainer)) return null

    const start = getCharOffset(this._editable, range.startContainer, range.startOffset)
    const end = getCharOffset(this._editable, range.endContainer, range.endOffset)

    if (start === -1 || end === -1) return null
    return { start, end }
  }

  private _restoreSelection(start: number, end: number): void {
    if (document.activeElement !== this._editable) return

    const sel = window.getSelection()
    if (!sel) return

    try {
      const startPos = findNodeAtOffset(this._editable, start)
      const endPos = findNodeAtOffset(this._editable, end)

      const range = document.createRange()
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset)

      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      // Ignore — selection restore is best-effort
    }
  }

  private _render(savedStart?: number, savedEnd?: number): void {
    const focused = document.activeElement === this._editable

    // Save selection if not provided
    let start = savedStart ?? 0
    let end = savedEnd ?? 0
    if (focused && savedStart === undefined) {
      const offsets = this._getSelectionOffsets()
      if (offsets) {
        start = offsets.start
        end = offsets.end
      }
    }

    // Clear and re-render
    this._editable.innerHTML = ''
    const nodes = textSerializer.render(this._state)
    for (const node of nodes) {
      this._editable.appendChild(node)
    }

    // Restore selection
    if (focused) {
      this._restoreSelection(start, end)
    }
  }

  private _applyOrRemoveInline(type: InlineTypes): void {
    const offsets = this._getSelectionOffsets()
    if (!offsets) return

    const { start, end } = offsets

    // No selection — no-op
    if (start === end) return

    // Guard against out-of-range (can happen with empty text)
    const textLen = this._state.text.length
    if (start < 0 || end > textLen || start >= end) return

    const toggled = this._state.isToggled(type, start, end)
    this._state = toggled
      ? this._state.removeInline(type, start, end)
      : this._state.addInline(type, start, end)

    this._render(start, end)
    this._updateToolbarState()
    this._notify()
  }

  private _handleInput(): void {
    const offsets = this._getSelectionOffsets()
    const start = offsets?.start ?? 0
    const end = offsets?.end ?? 0

    requestAnimationFrame(() => {
      const nodes = Array.from(this._editable.childNodes)
      this._state = textSerializer.parse(nodes)

      // Re-render to normalize DOM (avoids browser-injected divs/brs accumulating)
      this._render(start, end)
      this._notify()
    })
  }

  private _updateToolbarState(): void {
    const offsets = this._getSelectionOffsets()

    for (const [type, btn] of this._buttons) {
      let active = false

      if (offsets && offsets.start !== offsets.end) {
        const textLen = this._state.text.length
        const start = Math.max(0, offsets.start)
        const end = Math.min(textLen, offsets.end)
        if (start < end) {
          try {
            active = this._state.isToggled(type, start, end)
          } catch {
            active = false
          }
        }
      }

      btn.classList.toggle('is-active', active)
    }
  }
}
