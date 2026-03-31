import { Text, type InlineDtoMap, type InlineTypes } from '../text/text'

/** Inline types that carry no extra payload (Bold, Italic, Underline). */
type NeverPayloadTypes = { [K in InlineTypes]: InlineDtoMap[K] extends never ? K : never }[InlineTypes]
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
  #state: Text
  #editable: HTMLDivElement
  #toolbar: HTMLDivElement
  #listeners: Set<(t: Text) => void> = new Set()
  #composing = false

  #buttons: Map<NeverPayloadTypes, HTMLButtonElement> = new Map()

  constructor(container: HTMLElement, initial?: Text) {
    this.#state = initial ?? new Text('', [])

    // Build toolbar
    this.#toolbar = document.createElement('div')
    this.#toolbar.className = 'text-editor-toolbar'

    const buttonDefs: { type: NeverPayloadTypes; icon: Parameters<typeof createElement>[0] }[] = [
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
        this.#applyOrRemoveInline(type)
      })
      this.#toolbar.appendChild(btn)
      this.#buttons.set(type, btn)
    }

    // Build editable
    this.#editable = document.createElement('div')
    this.#editable.className = 'text-editor-editable'
    this.#editable.contentEditable = 'true'

    this.#editable.addEventListener('input', () => {
      if (!this.#composing) this.#handleInput()
    })
    this.#editable.addEventListener('compositionstart', () => {
      this.#composing = true
    })
    this.#editable.addEventListener('compositionend', () => {
      this.#composing = false
      this.#handleInput()
    })

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.#editable) {
        this.#updateToolbarState()
      }
    })

    container.appendChild(this.#toolbar)
    container.appendChild(this.#editable)

    this.#render()
  }

  getValue(): Text {
    return this.#state
  }

  setValue(text: Text): void {
    this.#state = text
    this.#render()
    this.#notify()
  }

  /** Registers a change listener. Returns an unsubscribe function. */
  onChange(cb: (text: Text) => void): () => void {
    this.#listeners.add(cb)
    return () => this.#listeners.delete(cb)
  }

  /** Removes the toolbar and editable DOM elements from the page. */
  destroy(): void {
    this.#toolbar.remove()
    this.#editable.remove()
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  #notify(): void {
    for (const cb of this.#listeners) cb(this.#state)
  }

  #getSelectionOffsets(): { start: number; end: number } | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)

    // Guard: selection must be within the editable
    if (!this.#editable.contains(range.startContainer)) return null

    const start = getCharOffset(this.#editable, range.startContainer, range.startOffset)
    const end = getCharOffset(this.#editable, range.endContainer, range.endOffset)

    if (start === -1 || end === -1) return null
    return { start, end }
  }

  #restoreSelection(start: number, end: number): void {
    if (document.activeElement !== this.#editable) return

    const sel = window.getSelection()
    if (!sel) return

    try {
      const startPos = findNodeAtOffset(this.#editable, start)
      const endPos = findNodeAtOffset(this.#editable, end)

      const range = document.createRange()
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset)

      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      // Ignore — selection restore is best-effort
    }
  }

  #render(savedStart?: number, savedEnd?: number): void {
    const focused = document.activeElement === this.#editable

    // Save selection if not provided
    let start = savedStart ?? 0
    let end = savedEnd ?? 0
    if (focused && savedStart === undefined) {
      const offsets = this.#getSelectionOffsets()
      if (offsets) {
        start = offsets.start
        end = offsets.end
      }
    }

    // Clear and re-render
    this.#editable.innerHTML = ''
    const nodes = textSerializer.render(this.#state)
    for (const node of nodes) {
      this.#editable.appendChild(node)
    }

    // Restore selection
    if (focused) {
      this.#restoreSelection(start, end)
    }
  }

  #applyOrRemoveInline(type: NeverPayloadTypes): void {
    const offsets = this.#getSelectionOffsets()
    if (!offsets) return

    const { start, end } = offsets

    // No selection — no-op
    if (start === end) return

    // Guard against out-of-range (can happen with empty text)
    const textLen = this.#state.text.length
    if (start < 0 || end > textLen || start >= end) return

    const toggled = this.#state.isToggled({ type, start, end })
    this.#state = toggled
      ? this.#state.removeInline(type, start, end)
      : this.#state.addInline({ type, start, end })

    this.#render(start, end)
    this.#updateToolbarState()
    this.#notify()
  }

  #handleInput(): void {
    const offsets = this.#getSelectionOffsets()
    const start = offsets?.start ?? 0
    const end = offsets?.end ?? 0

    requestAnimationFrame(() => {
      const nodes = Array.from(this.#editable.childNodes)
      this.#state = textSerializer.parse(nodes)

      // Re-render to normalize DOM (avoids browser-injected divs/brs accumulating)
      this.#render(start, end)
      this.#notify()
    })
  }

  #updateToolbarState(): void {
    const offsets = this.#getSelectionOffsets()

    for (const [type, btn] of this.#buttons) {
      let active = false

      if (offsets && offsets.start !== offsets.end) {
        const textLen = this.#state.text.length
        const start = Math.max(0, offsets.start)
        const end = Math.min(textLen, offsets.end)
        if (start < end) {
          try {
            active = this.#state.isToggled({ type, start, end })
          } catch {
            active = false
          }
        }
      }

      btn.classList.toggle('is-active', active)
    }
  }
}
