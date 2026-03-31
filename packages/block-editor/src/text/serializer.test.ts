import { describe, it, expect } from 'vitest'
import { textSerializer } from './serializer'
import { Text } from './text'

// Helper: convert a NodeList / Node[] to an outer HTML string using a wrapper div
function nodesToHtml(nodes: Node[]): string {
  const div = document.createElement('div')
  nodes.forEach((n) => div.appendChild(n))
  return div.innerHTML
}

// ─── render ──────────────────────────────────────────────────────────────────

describe('textSerializer.render', () => {
  it('renders plain text (no inlines) as a single text node', () => {
    const t = new Text('hello', [])
    const nodes = textSerializer.render(t)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].nodeType).toBe(Node.TEXT_NODE)
    expect(nodes[0].textContent).toBe('hello')
  })

  it('renders a single Bold inline as <strong>', () => {
    const t = new Text('hello', [{ type: 'Bold', start: 0, end: 5 }])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<strong>hello</strong>')
  })

  it('renders a single Italic inline as <em>', () => {
    const t = new Text('hello', [{ type: 'Italic', start: 0, end: 5 }])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<em>hello</em>')
  })

  it('renders a single Underline inline as <u>', () => {
    const t = new Text('hello', [{ type: 'Underline', start: 0, end: 5 }])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<u>hello</u>')
  })

  it('renders text before and after an inline', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 6, end: 11 }])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('hello <strong>world</strong>')
  })

  it('renders the plan example correctly', () => {
    // text="Hello world, this is a test"
    // Bold{5,15} → " worl" + "d, th" → " world, th"
    // Italic{10,20} → "d, th" + "is is" → "d, this is"
    // Expected: Hello<strong> worl<em>d, th</em></strong><em>is is</em> a test
    const t = new Text('Hello world, this is a test', [
      { type: 'Bold', start: 5, end: 15 },
      { type: 'Italic', start: 10, end: 20 },
    ])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('Hello<strong> worl<em>d, th</em></strong><em>is is</em> a test')
  })

  it('respects nesting order: start asc, end desc (longer inline wraps shorter)', () => {
    // Italic[0,10] and Bold[0,5]: Italic is longer so it is the outer wrapper
    const t = new Text('hello world', [
      { type: 'Bold', start: 0, end: 5 },
      { type: 'Italic', start: 0, end: 10 },
    ])
    const html = nodesToHtml(textSerializer.render(t))
    // Italic (end=10 > end=5) comes first in sort → outer; Bold is inside the overlap portion
    expect(html).toBe('<em><strong>hello</strong> worl</em>d')
  })

  it('renders multiple non-overlapping inlines', () => {
    const t = new Text('hello world', [
      { type: 'Bold', start: 0, end: 5 },
      { type: 'Italic', start: 6, end: 11 },
    ])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<strong>hello</strong> <em>world</em>')
  })

  it('renders overlapping inlines of the same type after addInline (merged)', () => {
    const t = new Text('hello world!!', [{ type: 'Bold', start: 0, end: 13 }])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<strong>hello world!!</strong>')
  })

  it('renders a Highlight inline as <mark> with data-color', () => {
    const t = new Text('hello', [{ type: 'Highlight', start: 0, end: 5, color: 'amber' }])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<mark data-color="amber">hello</mark>')
  })

  it('renders two adjacent Highlights with different colors as separate marks', () => {
    const t = new Text('hello world', [
      { type: 'Highlight', start: 0, end: 5, color: 'red' },
      { type: 'Highlight', start: 5, end: 11, color: 'blue' },
    ])
    const html = nodesToHtml(textSerializer.render(t))
    expect(html).toBe('<mark data-color="red" class="mark-join-right">hello</mark><mark data-color="blue" class="mark-join-left"> world</mark>')
  })

  it('adds mark-join-right/left classes to touching adjacent marks', () => {
    const t = new Text('hello world', [
      { type: 'Highlight', start: 0, end: 5, color: 'red' },
      { type: 'Highlight', start: 5, end: 11, color: 'blue' },
    ])
    const nodes = textSerializer.render(t)
    const [a, b] = nodes as HTMLElement[]
    expect(a.classList.contains('mark-join-right')).toBe(true)
    expect(b.classList.contains('mark-join-left')).toBe(true)
  })

  it('does not add join classes to non-touching marks', () => {
    const t = new Text('hello world', [
      { type: 'Highlight', start: 0, end: 5, color: 'red' },
      { type: 'Highlight', start: 6, end: 11, color: 'blue' },
    ])
    const nodes = textSerializer.render(t)
    const marks = (nodes as HTMLElement[]).filter(n => n.tagName === 'MARK')
    expect(marks[0].classList.contains('mark-join-right')).toBe(false)
    expect(marks[1].classList.contains('mark-join-left')).toBe(false)
  })

  it('adds both join classes to a middle mark in three touching marks', () => {
    const t = new Text('abcdef', [
      { type: 'Highlight', start: 0, end: 2, color: 'red' },
      { type: 'Highlight', start: 2, end: 4, color: 'blue' },
      { type: 'Highlight', start: 4, end: 6, color: 'green' },
    ])
    const nodes = textSerializer.render(t) as HTMLElement[]
    expect(nodes[0].classList.contains('mark-join-right')).toBe(true)
    expect(nodes[1].classList.contains('mark-join-left')).toBe(true)
    expect(nodes[1].classList.contains('mark-join-right')).toBe(true)
    expect(nodes[2].classList.contains('mark-join-left')).toBe(true)
  })

  it('adds join classes when touching marks are nested in other inlines', () => {
    // Underline[0,5] wraps Highlight[0,5]; Highlight[5,10] is sibling
    // Renders: <u><mark>hello</mark></u><mark> world</mark>
    const t = new Text('hello world', [
      { type: 'Underline', start: 0, end: 5 },
      { type: 'Highlight', start: 0, end: 5, color: 'red' },
      { type: 'Highlight', start: 5, end: 11, color: 'blue' },
    ])
    const nodes = textSerializer.render(t)
    const allMarks = (nodes as HTMLElement[]).flatMap(n =>
      n.tagName === 'MARK' ? [n] : Array.from(n.querySelectorAll<HTMLElement>('mark'))
    )
    expect(allMarks[0].classList.contains('mark-join-right')).toBe(true)
    expect(allMarks[1].classList.contains('mark-join-left')).toBe(true)
  })

  it('adds join classes when a single highlight is split by an overlapping inline', () => {
    // Underline[3,7] overlaps Highlight[5,9] — the highlight DTO produces two marks:
    // one inside <u> for [5,7] and one outside for [7,9]. They must be joined.
    // Renders: Hel<u>lo<mark> W</mark></u><mark>or</mark><u>l</u>d
    const t = new Text('Hello World ', [
      { type: 'Underline', start: 3, end: 7 },
      { type: 'Highlight', start: 5, end: 9, color: 'fuchsia' },
      { type: 'Underline', start: 9, end: 10 },
    ])
    const nodes = textSerializer.render(t)
    const allMarks = nodes.flatMap(n => {
      if (!(n instanceof HTMLElement)) return []
      return n.tagName === 'MARK' ? [n] : Array.from(n.querySelectorAll<HTMLElement>('mark'))
    })
    expect(allMarks).toHaveLength(2)
    expect(allMarks[0].classList.contains('mark-join-right')).toBe(true)
    expect(allMarks[1].classList.contains('mark-join-left')).toBe(true)
  })
})

// ─── parse ───────────────────────────────────────────────────────────────────

describe('textSerializer.parse', () => {
  it('parses a plain text node back to Text with no inlines', () => {
    const nodes = [document.createTextNode('hello')]
    const t = textSerializer.parse(nodes)
    expect(t.text).toBe('hello')
    expect(t.inline).toHaveLength(0)
  })

  it('parses a <strong> element to Bold inline', () => {
    const strong = document.createElement('strong')
    strong.textContent = 'world'
    const t = textSerializer.parse([strong])
    expect(t.text).toBe('world')
    expect(t.inline).toEqual([{ type: 'Bold', start: 0, end: 5 }])
  })

  it('parses a <em> element to Italic inline', () => {
    const em = document.createElement('em')
    em.textContent = 'world'
    const t = textSerializer.parse([em])
    expect(t.text).toBe('world')
    expect(t.inline).toEqual([{ type: 'Italic', start: 0, end: 5 }])
  })

  it('parses a <u> element to Underline inline', () => {
    const u = document.createElement('u')
    u.textContent = 'world'
    const t = textSerializer.parse([u])
    expect(t.text).toBe('world')
    expect(t.inline).toEqual([{ type: 'Underline', start: 0, end: 5 }])
  })

  it('parses a <mark> element with data-color to Highlight inline', () => {
    const mark = document.createElement('mark')
    mark.dataset.color = 'amber'
    mark.textContent = 'hello'
    const t = textSerializer.parse([mark])
    expect(t.text).toBe('hello')
    expect(t.inline).toEqual([{ type: 'Highlight', start: 0, end: 5, color: 'amber' }])
  })

  it('ignores a <mark> element without data-color', () => {
    const mark = document.createElement('mark')
    mark.textContent = 'hello'
    const t = textSerializer.parse([mark])
    expect(t.text).toBe('hello')
    expect(t.inline).toHaveLength(0)
  })
})

// ─── roundtrip ───────────────────────────────────────────────────────────────

describe('roundtrip: parse(render(text)) === text', () => {
  it('plain text roundtrip', () => {
    const t = new Text('hello', [])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('single inline roundtrip', () => {
    const t = new Text('hello world', [{ type: 'Bold', start: 0, end: 5 }])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('plan example roundtrip', () => {
    const t = new Text('Hello world, this is a test', [
      { type: 'Bold', start: 5, end: 15 },
      { type: 'Italic', start: 10, end: 20 },
    ])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('multiple non-overlapping inlines roundtrip', () => {
    const t = new Text('hello world', [
      { type: 'Bold', start: 0, end: 5 },
      { type: 'Italic', start: 6, end: 11 },
    ])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('underline inline roundtrip', () => {
    const t = new Text('underlined text here', [{ type: 'Underline', start: 0, end: 10 }])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('nested inlines roundtrip', () => {
    const t = new Text('hello world', [
      { type: 'Bold', start: 0, end: 5 },
      { type: 'Italic', start: 0, end: 10 },
    ])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('Highlight inline roundtrip', () => {
    const t = new Text('hello world', [{ type: 'Highlight', start: 0, end: 5, color: 'blue' }])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('two adjacent Highlights with different colors roundtrip', () => {
    const t = new Text('hello world', [
      { type: 'Highlight', start: 0, end: 5, color: 'red' },
      { type: 'Highlight', start: 5, end: 11, color: 'green' },
    ])
    const result = textSerializer.parse(textSerializer.render(t))
    expect(JSON.stringify(result)).toBe(JSON.stringify(t))
  })

  it('ignores empty inline element with <br> (browser Enter behaviour at start of bold text)', () => {
    // What Chrome produces when Enter is pressed at position 0 in <strong>Hello</strong>
    const emptyStrong = document.createElement('strong')
    emptyStrong.appendChild(document.createElement('br'))
    const contentStrong = document.createElement('strong')
    contentStrong.textContent = 'Hello'

    const result = textSerializer.parse([emptyStrong, contentStrong])
    expect(result.text).toBe('Hello')
    expect(result.inline).toEqual([{ type: 'Bold', start: 0, end: 5 }])
  })

  it('handles a bare <br> node without throwing (Enter in empty field)', () => {
    const br = document.createElement('br')
    const result = textSerializer.parse([br])
    expect(result.text).toBe('')
    expect(result.inline).toHaveLength(0)
  })
})
