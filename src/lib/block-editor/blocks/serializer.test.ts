import { describe, it, expect } from 'vitest'
import { blocksSerializer } from './serializer'
import { Blocks, Block } from './blocks'

// ─── helpers ──────────────────────────────────────────────────────────────────

function nodesToHtml(nodes: Node[]): string {
  const div = document.createElement('div')
  nodes.forEach((n) => div.appendChild(n))
  return div.innerHTML
}

function dto(id: string, text = '', children: Block[] = []): Block {
  return new Block(id, { text, inline: [] }, children)
}

// ─── render ───────────────────────────────────────────────────────────────────

describe('blocksSerializer.render', () => {
  it('renders a single block with a <p> element', () => {
    const blocks = Blocks.from([dto('b1', 'Hello')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="b1"><p>Hello</p></div>')
  })

  it('renders multiple root blocks', () => {
    const blocks = Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="b1"><p>Hello</p></div>' +
        '<div class="block" id="b2"><p>World</p></div>'
    )
  })

  it('renders nested children inside <div class="children">', () => {
    const blocks = Blocks.from([dto('p1', 'Parent', [dto('c1', 'Child')])])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="p1"><p>Parent</p>' +
        '<div class="children"><div class="block" id="c1"><p>Child</p></div></div></div>'
    )
  })

  it('omits <div class="children"> for leaf blocks', () => {
    const blocks = Blocks.from([dto('b1', 'Hello')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).not.toContain('children')
  })

  it('renders the plan example correctly', () => {
    const blocks = Blocks.from([
      new Block('block-1', { text: 'Hello World', inline: [] }, [
        new Block('block-2', { text: 'This is a test', inline: [] }, []),
      ]),
      new Block('block-3', { text: 'This is another', inline: [] }, []),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe(
      '<div class="block" id="block-1"><p>Hello World</p>' +
        '<div class="children"><div class="block" id="block-2"><p>This is a test</p></div></div></div>' +
        '<div class="block" id="block-3"><p>This is another</p></div>'
    )
  })

  it('renders inline formatting inside <p>', () => {
    const blocks = Blocks.from([
      new Block('b1', { text: 'Hello', inline: [{ type: 'Bold', start: 0, end: 5 }] }, []),
    ])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="b1"><p><strong>Hello</strong></p></div>')
  })

  it('renders an empty block with a <br> placeholder inside <p>', () => {
    const blocks = Blocks.from([dto('b1', '')])
    const html = nodesToHtml(blocksSerializer.render(blocks))
    expect(html).toBe('<div class="block" id="b1"><p><br></p></div>')
  })
})

// ─── parse ────────────────────────────────────────────────────────────────────

describe('blocksSerializer.parse', () => {
  function makeBlockEl(id: string, content: string, children?: Element[]): Element {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = id
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

  it('parses a single block element', () => {
    const el = makeBlockEl('b1', 'Hello')
    const result = blocksSerializer.parse([el])
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].id).toBe('b1')
    expect(result.blocks[0].data.text).toBe('Hello')
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
    expect(result.blocks[0].children[0].data.text).toBe('Child text')
  })

  it('throws when a block element is missing its id attribute', () => {
    const div = document.createElement('div')
    div.className = 'block'
    const p = document.createElement('p')
    p.textContent = 'hi'
    div.appendChild(p)
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a block element is missing its <p> child', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a block contains an unexpected element', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
    div.appendChild(document.createElement('p'))
    div.appendChild(document.createElement('span'))
    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when a text node appears directly inside a block element', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
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
    div.appendChild(document.createElement('p'))
    div.appendChild(childrenDiv)

    expect(() => blocksSerializer.parse([div])).toThrow()
  })

  it('throws when <div class="children"> exists but is empty', () => {
    const div = document.createElement('div')
    div.className = 'block'
    div.id = 'b1'
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

  it('single plain block roundtrip', () => {
    roundtrip(Blocks.from([dto('b1', 'Hello')]))
  })

  it('multiple root blocks roundtrip', () => {
    roundtrip(Blocks.from([dto('b1', 'Hello'), dto('b2', 'World')]))
  })

  it('nested blocks roundtrip', () => {
    roundtrip(Blocks.from([dto('p1', 'Parent', [dto('c1', 'Child')])]))
  })

  it('deeply nested blocks roundtrip', () => {
    roundtrip(Blocks.from([dto('p1', 'Parent', [dto('c1', 'Child', [dto('gc1', 'Grandchild')])])]))
  })

  it('plan example roundtrip', () => {
    roundtrip(Blocks.from([
      new Block('block-1', { text: 'Hello World', inline: [] }, [
        new Block('block-2', { text: 'This is a test', inline: [] }, []),
      ]),
      new Block('block-3', { text: 'This is another', inline: [] }, []),
    ]))
  })

  it('block with inline formatting roundtrip', () => {
    roundtrip(Blocks.from([
      new Block('b1', { text: 'Hello World', inline: [{ type: 'Bold', start: 0, end: 5 }] }, []),
    ]))
  })

  it('empty text block roundtrip', () => {
    roundtrip(Blocks.from([dto('b1', '')]))
  })
})
