import { describe, it, expect } from 'vitest'
import { blocksSerializer } from './serializer'
import { Blocks, TextBlock, OrderedListBlock, UnorderedListBlock } from './blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

function nodesToHtml(nodes: Node[]): string {
  const div = document.createElement('div')
  nodes.forEach((n) => div.appendChild(n))
  return div.innerHTML
}

function dto(id: string, text = '', children: TextBlock[] = []): TextBlock {
  return new TextBlock(id, new Text(text, []), children)
}

// ─── render ───────────────────────────────────────────────────────────────────

describe('blocksSerializer.render', () => {
  it('renders a single TextBlock with data-block-type="text"', () => {
    const blocks = Blocks.from([dto('b1', 'Hello')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="b1" data-block-type="text"><p>Hello</p></div>')
  })

  it('renders multiple root TextBlocks', () => {
    const blocks = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="b1" data-block-type="text"><p>Hello</p></div>' +
        '<div class="block" id="b2" data-block-type="text"><p>World</p></div>'
    )
  })

  it('renders nested children inside <div class="children">', () => {
    const blocks = Blocks.from([dto('p1', 'Parent', [dto('c1', 'Child')])])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="p1" data-block-type="text"><p>Parent</p>' +
        '<div class="children"><div class="block" id="c1" data-block-type="text"><p>Child</p></div></div></div>'
    )
  })

  it('omits <div class="children"> for leaf blocks', () => {
    const blocks = Blocks.from([dto('b1', 'Hello')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).not.toContain('children')
  })

  it('renders the plan example correctly', () => {
    const blocks = Blocks.from([
      new TextBlock('block-1', new Text('Hello World', []), [
        new TextBlock('block-2', new Text('This is a test', []), []),
      ]),
      new TextBlock('block-3', new Text('This is another', []), []),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="block-1" data-block-type="text"><p>Hello World</p>' +
        '<div class="children"><div class="block" id="block-2" data-block-type="text"><p>This is a test</p></div></div></div>' +
        '<div class="block" id="block-3" data-block-type="text"><p>This is another</p></div>'
    )
  })

  it('renders inline formatting inside <p>', () => {
    const blocks = Blocks.from([
      new TextBlock('b1', new Text('Hello', [{ type: 'Bold', start: 0, end: 5 }]), []),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="b1" data-block-type="text"><p><strong>Hello</strong></p></div>')
  })

  it('renders an empty block with a <br> placeholder inside <p>', () => {
    const blocks = Blocks.from([dto('b1', '')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="b1" data-block-type="text"><p><br></p></div>')
  })

  it('renders an OrderedListBlock at depth 0 with data-list-style="decimal"', () => {
    const blocks = Blocks.from([new OrderedListBlock('ol1', new Text('Item 1', []), [])])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="ol1" data-block-type="ordered-list" data-list-style="decimal"><p>Item 1</p></div>')
  })

  it('renders an UnorderedListBlock at depth 0 with data-list-style="disc"', () => {
    const blocks = Blocks.from([new UnorderedListBlock('ul1', new Text('Item 1', []), [])])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="ul1" data-block-type="unordered-list" data-list-style="disc"><p>Item 1</p></div>')
  })

  it('renders nested UnorderedListBlock with data-list-style cycling disc → circle → square', () => {
    const blocks = Blocks.from([
      new UnorderedListBlock('ul1', new Text('1', []), [
        new UnorderedListBlock('ul2', new Text('1.1', []), [
          new UnorderedListBlock('ul3', new Text('1.1.1', []), [
            new UnorderedListBlock('ul4', new Text('1.1.1.1', []), []),
          ]),
        ]),
      ]),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toContain('id="ul1" data-block-type="unordered-list" data-list-style="disc"')
    expect(html).toContain('id="ul2" data-block-type="unordered-list" data-list-style="circle"')
    expect(html).toContain('id="ul3" data-block-type="unordered-list" data-list-style="square"')
    expect(html).toContain('id="ul4" data-block-type="unordered-list" data-list-style="disc"')
  })

  it('renders nested OrderedListBlock with data-list-style cycling decimal → lower-alpha → lower-roman', () => {
    const blocks = Blocks.from([
      new OrderedListBlock('ol1', new Text('1', []), [
        new OrderedListBlock('ol2', new Text('1.1', []), [
          new OrderedListBlock('ol3', new Text('1.1.1', []), [
            new OrderedListBlock('ol4', new Text('1.1.1.1', []), []),
          ]),
        ]),
      ]),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toContain('id="ol1" data-block-type="ordered-list" data-list-style="decimal"')
    expect(html).toContain('id="ol2" data-block-type="ordered-list" data-list-style="lower-alpha"')
    expect(html).toContain('id="ol3" data-block-type="ordered-list" data-list-style="lower-roman"')
    expect(html).toContain('id="ol4" data-block-type="ordered-list" data-list-style="decimal"')
  })
})

// ─── parse ────────────────────────────────────────────────────────────────────

describe('blocksSerializer.parse', () => {
  function makeBlockEl(id: string, content: string, children?: Element[], blockType = 'text'): Element {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = id
    div.setAttribute('data-block-type', blockType)
    const p = document.createElement('p')
    p.textContent = content
    div.appendChild(p)
    if (children && children.length > 0) {
      const childrenDiv = document.createElement('div')
      childrenDiv.className = 'children'
      children.forEach((c) => childrenDiv.appendChild(c))
      div.appendChild(childrenDiv)
    }
    return div
  }

  it('parses a single TextBlock element', () => {
    const el = makeBlockEl('b1', 'Hello')
    const result = blocksSerializer.parse([el])
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].id).toBe('b1')
    expect(result.blocks[0].data.text).toBe('Hello')
    expect(result.blocks[0]).toBeInstanceOf(TextBlock)
  })

  it('parses a single OrderedListBlock element', () => {
    const el = makeBlockEl('ol1', 'Item', [], 'ordered-list')
    const result = blocksSerializer.parse([el])
    expect(result.blocks[0]).toBeInstanceOf(OrderedListBlock)
    expect(result.blocks[0].data.text).toBe('Item')
  })

  it('parses a single UnorderedListBlock element', () => {
    const el = makeBlockEl('ul1', 'Item', [], 'unordered-list')
    const result = blocksSerializer.parse([el])
    expect(result.blocks[0]).toBeInstanceOf(UnorderedListBlock)
    expect(result.blocks[0].data.text).toBe('Item')
  })

  it('parses multiple root block elements', () => {
    const result = blocksSerializer.parse([makeBlockEl('b1', 'A'), makeBlockEl('b2', 'B')])
    expect(result.blocks.map((x) => x.id)).toEqual(['b1', 'b2'])
  })

  it('parses nested children', () => {
    const child = makeBlockEl('child', 'Child text')
    const parent = makeBlockEl('parent', 'Parent text', [child])
    const result = blocksSerializer.parse([parent])
    expect(result.blocks[0].children).toHaveLength(1)
    expect(result.blocks[0].children[0].id).toBe('child')
    expect((result.blocks[0].children[0] as TextBlock).data.text).toBe('Child text')
  })

  it('throws when a block element is missing its id attribute', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.setAttribute('data-block-type', 'text')
    const p = document.createElement('p')
    p.textContent = 'hi'
    div.appendChild(p)
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a block element is missing data-block-type attribute', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    const p = document.createElement('p')
    p.textContent = 'hi'
    div.appendChild(p)
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when data-block-type is an unknown value', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'unknown-type')
    div.appendChild(document.createElement('p'))
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a block element is missing its <p> child', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'text')
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a block contains an unexpected element', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'text')
    div.appendChild(document.createElement('p'))
    div.appendChild(document.createElement('span'))
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a text node appears directly inside a block element', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'text')
    div.appendChild(document.createTextNode('oops'))
    div.appendChild(document.createElement('p'))
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a text node appears inside <div class="children">', () => {
    const childrenDiv = document.createElement('div')
    childrenDiv.className = 'children'
    childrenDiv.appendChild(document.createTextNode('oops'))

    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'text')
    div.appendChild(document.createElement('p'))
    div.appendChild(childrenDiv)

    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when <div class="children"> exists but is empty', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'text')
    div.appendChild(document.createElement('p'))
    const childrenDiv = document.createElement('div')
    childrenDiv.className = 'children'
    div.appendChild(childrenDiv)
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('ignores extra attributes on recognised elements', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.setAttribute('data-block-type', 'text')
    div.setAttribute('data-extra', 'value')
    const p = document.createElement('p')
    p.setAttribute('style', 'color:red')
    p.textContent = 'Hello'
    div.appendChild(p)
    const result = blocksSerializer.parse([div])
    expect(result.blocks[0].data.text).toBe('Hello')
  })
})

// ─── roundtrip ───────────────────────────────────────────────────────────────

describe('roundtrip: parse(render(blocks)) === blocks', () => {
  function roundtrip(blocks: Blocks): void {
    const rendered = blocksSerializer.render(blocks)
    const parsed = blocksSerializer.parse(rendered)
    expect(JSON.stringify(parsed.blocks)).toBe(JSON.stringify(blocks.blocks))
  }

  it('single plain TextBlock roundtrip', () => {
    roundtrip(Blocks.from([dto('b1', 'Hello')]))
  })

  it('multiple root TextBlocks roundtrip', () => {
    roundtrip(Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')]))
  })

  it('nested TextBlocks roundtrip', () => {
    roundtrip(Blocks.from([dto('p1', 'Parent', [dto('c1', 'Child')])]))
  })

  it('deeply nested TextBlocks roundtrip', () => {
    roundtrip(Blocks.from([dto('p1', 'Parent', [dto('c1', 'Child', [dto('gc1', 'Grandchild')])])]))
  })

  it('plan example roundtrip', () => {
    roundtrip(Blocks.from([
      new TextBlock('block-1', new Text('Hello World', []), [
        new TextBlock('block-2', new Text('This is a test', []), []),
      ]),
      new TextBlock('block-3', new Text('This is another', []), []),
    ]))
  })

  it('TextBlock with inline formatting roundtrip', () => {
    roundtrip(Blocks.from([
      new TextBlock('b1', new Text('Hello World', [{ type: 'Bold', start: 0, end: 5 }]), []),
    ]))
  })

  it('empty text TextBlock roundtrip', () => {
    roundtrip(Blocks.from([dto('b1', '')]))
  })

  it('OrderedListBlock roundtrip', () => {
    roundtrip(Blocks.from([
      new OrderedListBlock('ol1', new Text('Item 1', []), []),
      new OrderedListBlock('ol2', new Text('Item 2', []), []),
    ]))
  })

  it('mixed TextBlock and OrderedListBlock roundtrip', () => {
    roundtrip(Blocks.from([
      new TextBlock('t1', new Text('Heading', []), []),
      new OrderedListBlock('ol1', new Text('Item 1', []), []),
      new OrderedListBlock('ol2', new Text('Item 2', []), []),
    ]))
  })

  it('UnorderedListBlock roundtrip', () => {
    roundtrip(Blocks.from([
      new UnorderedListBlock('ul1', new Text('Item 1', []), []),
      new UnorderedListBlock('ul2', new Text('Item 2', []), []),
    ]))
  })

  it('mixed TextBlock and UnorderedListBlock roundtrip', () => {
    roundtrip(Blocks.from([
      new TextBlock('t1', new Text('Heading', []), []),
      new UnorderedListBlock('ul1', new Text('Item 1', []), []),
      new UnorderedListBlock('ul2', new Text('Item 2', []), []),
    ]))
  })
})
import { HeaderBlock, Header } from './blocks'

// ─── HeaderBlock serializer ───────────────────────────────────────────────────

describe('blocksSerializer.render — HeaderBlock', () => {
  it('renders an H2 with data-block-type="header" and data-header-level="2"', () => {
    const blocks = Blocks.from([
      new HeaderBlock('h1', new Header(2, new Text('Section', [])), []),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="h1" data-block-type="header" data-header-level="2"><p>Section</p></div>'
    )
  })

  it('renders each of H1, H2, H3 with the correct data-header-level', () => {
    for (const level of [1, 2, 3] as const) {
      const blocks = Blocks.from([
        new HeaderBlock('h', new Header(level, new Text('Title', [])), []),
      ])
      const html = nodesToHtml(blocksSerializer.render(blocks))
      expect(html).toContain(`data-header-level="${level}"`)
    }
  })

  it('renders an empty HeaderBlock with a <br> placeholder', () => {
    const blocks = Blocks.from([
      new HeaderBlock('h', new Header(1, new Text('', [])), []),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toContain('<br>')
  })
})

describe('blocksSerializer.parse — HeaderBlock', () => {
  function makeHeaderEl(id: string, content: string, level: number): Element {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = id
    div.setAttribute('data-block-type', 'header')
    div.setAttribute('data-header-level', String(level))
    const p = document.createElement('p')
    p.textContent = content
    div.appendChild(p)
    return div
  }

  it('parses a header element into a HeaderBlock with correct level and text', () => {
    const el = makeHeaderEl('h1', 'My Heading', 2)
    const result = blocksSerializer.parse([el])
    const block = result.blocks[0] as HeaderBlock
    expect(block).toBeInstanceOf(HeaderBlock)
    expect(block.data.level).toBe(2)
    expect(block.data.text.text).toBe('My Heading')
  })

  it('throws when data-header-level is missing on a header block', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'h1'
    div.setAttribute('data-block-type', 'header')
    div.appendChild(document.createElement('p'))
    expect(() => blocksSerializer.parse([div])).toThrow()
  })
})

describe('roundtrip — HeaderBlock', () => {
  it('HeaderBlock roundtrip preserves level and text', () => {
    const blocks = Blocks.from([
      new HeaderBlock('h', new Header(2, new Text('Hello', [])), []),
    ])
    const rendered = blocksSerializer.render(blocks)
    const parsed = blocksSerializer.parse(rendered)
    expect(JSON.stringify(parsed.blocks)).toBe(JSON.stringify(blocks.blocks))
  })

  it('mixed TextBlock + HeaderBlock roundtrip', () => {
    const blocks = Blocks.from([
      new HeaderBlock('h', new Header(1, new Text('Title', [])), []),
      new TextBlock('t', new Text('Body', []), []),
    ])
    const rendered = blocksSerializer.render(blocks)
    const parsed = blocksSerializer.parse(rendered)
    expect(JSON.stringify(parsed.blocks)).toBe(JSON.stringify(blocks.blocks))
  })
})
