import { InlineDtoMap, InlineDto, InlineTypes, Text, TextDto } from './text'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A generic serializer contract for converting between a domain value `T`
 * and an array of DOM `Node` instances.
 */
export type Serializer<T> = {
  /**
   * Reconstructs a domain value from an array of DOM nodes.
   * Only required to handle output produced by `render`.
   */
  parse(nodes: Node[]): T

  /** Converts a domain value into an array of DOM nodes. */
  render(item: T): Node[]
}

/** Serializer specialized for the `Text` value object. */
export type TextSerializer = Serializer<Text>

// ─── Element tag map ──────────────────────────────────────────────────────────

/**
 * Maps every `InlineTypes` key to its corresponding HTML tag name.
 *
 * TypeScript will produce a compile-time error if a new key is added to
 * `InlineDtoMap` without adding a corresponding entry here, because the type
 * `{ [K in InlineTypes]: string }` requires all keys to be present.
 */
const tagMap: { [K in InlineTypes]: string } = {
  Bold: 'strong',
  Italic: 'em',
  Underline: 'u',
} as const satisfies { [K in keyof InlineDtoMap]: string }

/** Reverse lookup: HTML tag name → InlineTypes */
const tagToType: Record<string, InlineTypes> = Object.fromEntries(
  (Object.entries(tagMap) as [InlineTypes, string][]).map(([type, tag]) => [tag, type])
)

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Represents a contiguous range of text and the stack of inline types that
 * are active over that range.
 *
 * The `types` array is ordered outermost → innermost (matching render-sort
 * order: start asc, end desc).
 */
type Segment = {
  start: number
  end: number
  types: InlineTypes[]
}

/**
 * Splits the text into segments where each segment shares the same active
 * inline stack.  Inlines are processed in render order (start asc, end desc).
 *
 * @param text - The raw text string.
 * @param inlines - All inlines (will be sorted internally).
 * @returns An array of non-overlapping, contiguous segments covering the full text.
 */
function buildSegments(text: string, inlines: ReadonlyArray<InlineDto>): Segment[] {
  // Collect all boundary positions
  const positions = new Set<number>([0, text.length])
  for (const inline of inlines) {
    positions.add(inline.start)
    positions.add(inline.end)
  }
  const sorted = [...positions].sort((a, b) => a - b)

  // Sort inlines in render order: start asc, end desc
  const renderOrder = [...inlines].sort((a, b) => a.start - b.start || b.end - a.end)

  const segments: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    const mid = (start + end) / 2
    const types = renderOrder
      .filter((inline) => inline.start <= mid && inline.end > mid)
      .map((inline) => inline.type)
    segments.push({ start, end, types })
  }
  return segments
}

/**
 * Recursively converts segments that share a common outer inline type into a
 * DOM element, nesting inner segments as children.
 *
 * @param text - The full raw text string (used for slicing).
 * @param segments - The segments to render (all with the same current depth context).
 * @param depth - The current nesting depth (index into each segment's `types` array).
 * @returns An array of DOM nodes.
 */
function renderSegments(text: string, segments: Segment[], depth: number): Node[] {
  const nodes: Node[] = []
  let i = 0

  while (i < segments.length) {
    const seg = segments[i]
    const currentType = seg.types[depth]

    if (currentType === undefined) {
      // No inline at this depth — emit a plain text node.
      nodes.push(document.createTextNode(text.slice(seg.start, seg.end)))
      i++
      continue
    }

    // Collect consecutive segments that share the same outer type at this depth.
    let j = i
    while (j < segments.length && segments[j].types[depth] === currentType) {
      j++
    }

    const groupedSegments = segments.slice(i, j)
    const el = document.createElement(tagMap[currentType])
    // Recurse into the next depth level for the grouped segments.
    renderSegments(text, groupedSegments, depth + 1).forEach((child) => el.appendChild(child))
    nodes.push(el)
    i = j
  }

  return nodes
}

/**
 * Renders a `Text` value object into an array of DOM `Node` instances.
 *
 * Inlines are processed in render order (start ascending, end descending) so
 * that when two inlines share the same start the one with the larger end wraps
 * the one with the smaller end.
 *
 * @param text - The `Text` value object to render.
 * @returns An array of `Node` instances representing the formatted content.
 */
function render(text: Text): Node[] {
  if (text.inline.length === 0) {
    return [document.createTextNode(text.text)]
  }

  const segments = buildSegments(text.text, text.inline)
  return renderSegments(text.text, segments, 0)
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Recursively extracts text content and inline annotations from a DOM node.
 *
 * @param node - The DOM node to process.
 * @param offset - Character offset accumulated from previously processed siblings.
 * @param activeTypes - Stack of inline types active for ancestor elements.
 * @param inlines - Accumulator for discovered inline annotations.
 * @returns The number of characters contributed by this node.
 */
function parseNode(
  node: Node,
  offset: number,
  activeTypes: InlineTypes[],
  inlines: InlineDto[]
): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const len = (node.textContent ?? '').length
    // Emit one inline per active ancestor type covering this text span.
    // (The caller handles deduplication / merging via addInline on Text.)
    return len
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const type = tagToType[tag] as InlineTypes | undefined

    const newActiveTypes = type ? [...activeTypes, type] : activeTypes
    let charCount = 0

    for (const child of Array.from(el.childNodes)) {
      charCount += parseNode(child, offset + charCount, newActiveTypes, inlines)
    }

    if (type !== undefined && charCount > 0) {
      inlines.push({ type, start: offset, end: offset + charCount })
    }

    return charCount
  }

  return 0
}

/**
 * Reconstructs a `Text` value object from an array of DOM nodes produced by
 * `render`.  Only handles output that `render` itself produces; behaviour on
 * arbitrary HTML is undefined.
 *
 * @param nodes - DOM nodes as returned by `render`.
 * @returns A `Text` instance equivalent to the original that was rendered.
 */
function parse(nodes: Node[]): Text {
  let rawText = ''
  const inlines: InlineDto[] = []

  // First pass: collect raw text
  function extractText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    let s = ''
    for (const child of Array.from(node.childNodes)) s += extractText(child)
    return s
  }

  for (const node of nodes) {
    rawText += extractText(node)
  }

  // Second pass: collect inlines with correct offsets
  let offset = 0
  for (const node of nodes) {
    const charCount = parseNode(node, offset, [], inlines)
    offset += charCount
  }

  // Build Text using addInline to handle merging (in case of overlap from nesting)
  let t = new Text(rawText, [])
  for (const inline of inlines) {
    t = t.addInline(inline.type, inline.start, inline.end)
  }
  return t
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** The concrete `TextSerializer` implementation. */
export const textSerializer: TextSerializer = { render, parse }
