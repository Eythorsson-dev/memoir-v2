import { type Blocks, BlockOffset, BlockRange } from '../blocks/blocks'
import { blocksSerializer } from '../blocks/serializer'
import type { BlockSelection } from './events'

// ─── DOM helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the character offset of `targetOffset` within `targetNode`,
 * counted from the start of `root` using only text nodes.
 * Returns -1 if `targetNode` is not found within `root`.
 */
export function getCharOffset(root: Node, targetNode: Node, targetOffset: number): number {
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

  if (targetNode === root) return targetOffset
  return -1
}

/**
 * Finds the text node and local offset corresponding to a character offset
 * within `root`.
 */
export function findNodeAtOffset(root: Node, targetOffset: number): { node: globalThis.Text; offset: number } {
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

  const last = walker.currentNode
  if (last && last.nodeType === Node.TEXT_NODE) {
    return { node: last as globalThis.Text, offset: (last.textContent ?? '').length }
  }

  return { node: root as unknown as globalThis.Text, offset: 0 }
}

/** Walks ancestors to find the nearest `.block` element. */
export function getBlockElement(node: Node): Element | null {
  let current: Node | null = node
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).classList.contains('block')) {
      return current as Element
    }
    current = current.parentNode
  }
  return null
}

/** Returns the direct `<p>`, `<h1>`, `<h2>`, or `<h3>` child of a block element. */
export function getBlockElementContent(blockEl: Element): Element {
  for (const child of Array.from(blockEl.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toLowerCase()
      if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3') {
        return child as Element
      }
    }
  }
  throw new Error(`Block element '${blockEl.id}' is missing its content element`)
}

// ─── BlockRenderer ──────────────────────────────────────────────────────────

/**
 * Converts `Blocks` state to DOM and applies minimal-mutation re-renders
 *
 * @remarks
 * Extracted from `BlockEditor` to enable composition by `DailyNoteEditor`.
 * Owns the conversion of `Blocks` → DOM and selection save/restore.
 */
export class BlockRenderer {
  #editable: HTMLElement

  constructor(editable: HTMLElement) {
    this.#editable = editable
  }

  /** The editable element this renderer targets. */
  get editable(): HTMLElement {
    return this.#editable
  }

  /**
   * Render blocks into the editable element, optionally restoring a selection
   *
   * @remarks
   * Clears the editable and re-renders all blocks from scratch. If `selection`
   * is provided, it is restored after rendering. If omitted and the editable
   * is focused, the current selection is saved and restored.
   */
  render(blocks: Blocks, selection?: BlockSelection): void {
    const focused = document.activeElement === this.#editable

    let savedSel: BlockSelection | undefined = selection
    if (savedSel === undefined && focused) {
      savedSel = this.getSelection() ?? undefined
    }

    this.#editable.innerHTML = ''
    const nodes = blocksSerializer.render(blocks)
    for (const node of nodes) {
      this.#editable.appendChild(node)
    }

    if (savedSel !== undefined) {
      try {
        this.restoreSelection(savedSel)
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Read the current DOM selection as a BlockSelection
   *
   * @returns A `BlockOffset` for a collapsed cursor, a `BlockRange` for a
   *   non-collapsed selection, or `null` if there is no selection within the
   *   editable.
   */
  getSelection(): BlockSelection | null {
    const domSel = window.getSelection()
    if (!domSel || domSel.rangeCount === 0) return null

    const range = domSel.getRangeAt(0)
    if (!this.#editable.contains(range.startContainer)) return null
    if (!this.#editable.contains(range.endContainer)) return null

    const startBlockEl = getBlockElement(range.startContainer)
    const endBlockEl = getBlockElement(range.endContainer)
    if (!startBlockEl || !endBlockEl) return null

    const startBlockId = startBlockEl.id
    const endBlockId = endBlockEl.id

    const startP = getBlockElementContent(startBlockEl)
    const endP = getBlockElementContent(endBlockEl)

    const startOffset = getCharOffset(startP, range.startContainer, range.startOffset)
    const endOffset = getCharOffset(endP, range.endContainer, range.endOffset)

    if (startOffset === -1 || endOffset === -1) return null

    if (range.collapsed) {
      return new BlockOffset(startBlockId, startOffset)
    }

    if (startBlockId === endBlockId && startOffset === endOffset) {
      return new BlockOffset(startBlockId, startOffset)
    }

    return new BlockRange(
      new BlockOffset(startBlockId, startOffset),
      new BlockOffset(endBlockId, endOffset),
    )
  }

  /**
   * Restore a BlockSelection to the DOM
   *
   * @throws {Error} If the block elements referenced by the selection are not
   *   found in the editable.
   */
  restoreSelection(sel: BlockSelection): void {
    restoreSelectionInRoot(this.#editable, sel)
  }
}

/**
 * Restore a BlockSelection to the DOM within `root`.
 * Shared by BlockRenderer (single-section) and DailyNoteScrollView (cross-section).
 */
export function restoreSelectionInRoot(root: HTMLElement, sel: BlockSelection): void {
  const domSel = window.getSelection()
  if (!domSel) return

  const range = document.createRange()

  if (sel instanceof BlockOffset) {
    const blockEl = root.querySelector(`[id="${sel.blockId}"]`)
    if (!blockEl) return
    const p = getBlockElementContent(blockEl)
    const { node, offset } = findNodeAtOffset(p, sel.offset)
    range.setStart(node, offset)
    range.setEnd(node, offset)
  } else {
    const startBlockEl = root.querySelector(`[id="${sel.start.blockId}"]`)
    const endBlockEl = root.querySelector(`[id="${sel.end.blockId}"]`)
    if (!startBlockEl || !endBlockEl) return
    const startP = getBlockElementContent(startBlockEl)
    const endP = getBlockElementContent(endBlockEl)
    const startPos = findNodeAtOffset(startP, sel.start.offset)
    const endPos = findNodeAtOffset(endP, sel.end.offset)
    range.setStart(startPos.node, startPos.offset)
    range.setEnd(endPos.node, endPos.offset)
  }

  domSel.removeAllRanges()
  domSel.addRange(range)
}
