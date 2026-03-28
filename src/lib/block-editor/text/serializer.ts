import { type InlineDtoMap, type InlineDto, type InlineTypes, type HighlightColor, Text } from './text'
import { type Serializer } from '../serializer'

export type { Serializer } from '../serializer'

/** Serializer specialized for the `Text` value object. */
export type TextSerializer = Serializer<Text>

// ─── Render map ───────────────────────────────────────────────────────────────

/**
 * Maps every `InlineTypes` key to a factory that creates the appropriate
 * DOM element for that inline, including any payload-derived attributes.
 *
 * TypeScript will produce a compile-time error if a new key is added to
 * `InlineDtoMap` without adding a corresponding entry here.
 */
const inlineRenderMap = {
  Bold:      ()    => document.createElement('strong'),
  Italic:    ()    => document.createElement('em'),
  Underline: ()    => document.createElement('u'),
  Highlight: (dto: InlineDto<'Highlight'>) => {
    const el = document.createElement('mark')
    el.dataset.color = dto.color
    return el
  },
} as const satisfies { [K in keyof InlineDtoMap]: (dto: InlineDto<K>) => HTMLElement }

// ─── Parse map ────────────────────────────────────────────────────────────────

/**
 * Maps HTML tag names to a parser function that extracts an inline's type and
 * payload from the element. Returns `null` if the element is not a valid inline.
 *
 * The `start` and `end` offsets are not part of the element — they are computed
 * by the DOM-walking logic in `parseNode`.
 */
const inlineParseMap: Record<string, (el: HTMLElement) => { type: InlineTypes } & Partial<InlineDtoMap[InlineTypes]> | null> = {
  STRONG: () => ({ type: 'Bold' as const }),
  EM:     () => ({ type: 'Italic' as const }),
  U:      () => ({ type: 'Underline' as const }),
  MARK:   (el) => {
    const color = el.dataset.color as HighlightColor | undefined
    if (!color) return null
    return { type: 'Highlight' as const, color }
  },
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Represents a contiguous range of text and the stack of inline types that
 * are active over that range.
 *
 * The `inlines` array is ordered outermost → innermost (matching render-sort
 * order: start asc, end desc).
 */
type Segment = {
  start: number
  end: number
  inlines: InlineDto[]
}

/**
 * Splits the text into segments where each segment shares the same active
 * inline stack. Inlines are processed in render order (start asc, end desc).
 */
function buildSegments(text: string, inlines: ReadonlyArray<InlineDto>): Segment[] {
  const positions = new Set<number>([0, text.length])
  for (const inline of inlines) {
    positions.add(inline.start)
    positions.add(inline.end)
  }
  const sorted = [...positions].sort((a, b) => a - b)

  const renderOrder = [...inlines].sort((a, b) => a.start - b.start || b.end - a.end) as InlineDto[]

  const segments: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    const mid = (start + end) / 2
    const active = renderOrder.filter((inline) => inline.start <= mid && inline.end > mid)
    segments.push({ start, end, inlines: active })
  }
  return segments
}

/**
 * Recursively converts segments that share a common outer inline into a
 * DOM element, nesting inner segments as children.
 */
function renderSegments(text: string, segments: Segment[], depth: number): Node[] {
  const nodes: Node[] = []
  let i = 0

  while (i < segments.length) {
    const seg = segments[i]
    const currentInline = seg.inlines[depth]

    if (currentInline === undefined) {
      nodes.push(document.createTextNode(text.slice(seg.start, seg.end)))
      i++
      continue
    }

    // Collect consecutive segments that share the same outer inline at this depth.
    // Two segments share the same outer inline when they reference the identical object.
    let j = i
    while (j < segments.length && segments[j].inlines[depth] === currentInline) {
      j++
    }

    const groupedSegments = segments.slice(i, j)
    // Cast through unknown because the renderMap entry is typed for the specific K
    const el = (inlineRenderMap[currentInline.type] as (dto: InlineDto) => HTMLElement)(currentInline)
    renderSegments(text, groupedSegments, depth + 1).forEach((child) => el.appendChild(child))
    nodes.push(el)
    i = j
  }

  return nodes
}

/**
 * Renders a `Text` value object into an array of DOM `Node` instances.
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
 */
function parseNode(
  node: Node,
  offset: number,
  activeInlines: InlineDto[],
  inlines: InlineDto[]
): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').length
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    const parser = inlineParseMap[el.tagName]
    const parsed = parser ? parser(el) : null

    // Build an inline stub (without start/end) for passing down to children
    const newActiveInlines = parsed
      ? [...activeInlines, parsed as InlineDto]
      : activeInlines

    let charCount = 0
    for (const child of Array.from(el.childNodes)) {
      charCount += parseNode(child, offset + charCount, newActiveInlines, inlines)
    }

    if (parsed !== null && charCount > 0) {
      inlines.push({ ...parsed, start: offset, end: offset + charCount } as InlineDto)
    }

    return charCount
  }

  return 0
}

/**
 * Reconstructs a `Text` value object from an array of DOM nodes produced by
 * `render`. Only handles output that `render` itself produces.
 */
function parse(nodes: Node[]): Text {
  let rawText = ''
  const inlines: InlineDto[] = []

  function extractText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    let s = ''
    for (const child of Array.from(node.childNodes)) s += extractText(child)
    return s
  }

  for (const node of nodes) {
    rawText += extractText(node)
  }

  let offset = 0
  for (const node of nodes) {
    const charCount = parseNode(node, offset, [], inlines)
    offset += charCount
  }

  let t = new Text(rawText, [])
  for (const inline of inlines) {
    t = t.addInline(inline)
  }
  return t
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** The concrete `TextSerializer` implementation. */
export const textSerializer: TextSerializer = { render, parse }
