import { describe, it, expect } from 'vitest'
import { Block, Blocks, BlockDto } from './blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

const emptyText = new Text('', [])
const helloText = new Text('Hello', [])
const worldText = new Text('World', [])

function block(id: string, children: Block[] = []): Block {
  return new Block(id, emptyText, children)
}

// ─── Block constructor ────────────────────────────────────────────────────────

describe('Block constructor', () => {
  it('creates a block with id, data, and children', () => {
    const b = new Block('a', helloText, [])
    expect(b.id).toBe('a')
    expect(b.data).toBe(helloText)
    expect(b.children).toEqual([])
  })

  it('creates a block with nested children', () => {
    const child = block('child')
    const parent = new Block('parent', emptyText, [child])
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0].id).toBe('child')
  })

  it('throws if id is empty string', () => {
    expect(() => new Block('', emptyText, [])).toThrow()
  })
})

// ─── Blocks constructor ───────────────────────────────────────────────────────

describe('Blocks constructor', () => {
  it('creates a Blocks instance with one block', () => {
    const b = new Blocks([block('a')])
    expect(b.blocks).toHaveLength(1)
  })

  it('creates a Blocks instance with multiple blocks', () => {
    const b = new Blocks([block('a'), block('b')])
    expect(b.blocks).toHaveLength(2)
  })

  it('throws if the array is empty', () => {
    expect(() => new Blocks([])).toThrow()
  })

  it('throws if root-level blocks have duplicate IDs', () => {
    expect(() => new Blocks([block('a'), block('a')])).toThrow()
  })

  it('throws if a nested block has the same ID as a root block', () => {
    const child = block('a')
    expect(() => new Blocks([new Block('a', emptyText, [child])])).toThrow()
  })

  it('throws if two nested blocks share an ID', () => {
    const child1 = block('dup')
    const child2 = block('dup')
    expect(() =>
      new Blocks([new Block('parent', emptyText, [child1, child2])])
    ).toThrow()
  })
})

// ─── Blocks.from ──────────────────────────────────────────────────────────────

describe('Blocks.from', () => {
  it('creates a Blocks instance from DTO', () => {
    const dto: BlockDto[] = [
      { id: 'a', data: { text: 'Hello', inline: [] }, children: [] },
    ]
    const b = Blocks.from(dto)
    expect(b.blocks).toHaveLength(1)
    expect(b.blocks[0].id).toBe('a')
    expect(b.blocks[0].data).toBeInstanceOf(Text)
    expect(b.blocks[0].data.text).toBe('Hello')
  })

  it('recursively converts nested children', () => {
    const dto: BlockDto[] = [
      {
        id: 'parent',
        data: { text: 'Parent', inline: [] },
        children: [
          { id: 'child', data: { text: 'Child', inline: [] }, children: [] },
        ],
      },
    ]
    const b = Blocks.from(dto)
    expect(b.blocks[0].children).toHaveLength(1)
    expect(b.blocks[0].children[0]).toBeInstanceOf(Block)
    expect(b.blocks[0].children[0].id).toBe('child')
  })

  it('matches the plan example structure', () => {
    const dto: BlockDto[] = [
      {
        id: 'block-1',
        data: { text: 'Hello World', inline: [] },
        children: [
          { id: 'block-2', data: { text: 'This is a test', inline: [] }, children: [] },
        ],
      },
      { id: 'block-3', data: { text: 'This is another', inline: [] }, children: [] },
    ]
    const b = Blocks.from(dto)
    expect(b.blocks).toHaveLength(2)
    expect(b.blocks[0].id).toBe('block-1')
    expect(b.blocks[0].children[0].id).toBe('block-2')
    expect(b.blocks[1].id).toBe('block-3')
  })

  it('throws if array is empty', () => {
    expect(() => Blocks.from([])).toThrow()
  })
})

// ─── addBefore ────────────────────────────────────────────────────────────────

describe('addBefore', () => {
  it('inserts a block before the target at root level', () => {
    const b = new Blocks([block('a'), block('b')])
    const result = b.addBefore('b', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['a', 'new', 'b'])
  })

  it('inserts a block before the first root block', () => {
    const b = new Blocks([block('a')])
    const result = b.addBefore('a', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['new', 'a'])
  })

  it('inserts a block before a nested block', () => {
    const b = new Blocks([new Block('parent', emptyText, [block('child')])])
    const result = b.addBefore('child', block('new'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['new', 'child'])
  })

  it('throws if target id does not exist', () => {
    const b = new Blocks([block('a')])
    expect(() => b.addBefore('missing', block('new'))).toThrow()
  })

  it('throws if new block id already exists in the tree', () => {
    const b = new Blocks([block('a'), block('b')])
    expect(() => b.addBefore('b', block('a'))).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = new Blocks([block('a')])
    const result = b.addBefore('a', block('new'))
    expect(result).not.toBe(b)
    expect(b.blocks).toHaveLength(1)
  })
})

// ─── addAfter ─────────────────────────────────────────────────────────────────

describe('addAfter', () => {
  it('inserts a block after the target at root level', () => {
    const b = new Blocks([block('a'), block('b')])
    const result = b.addAfter('a', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['a', 'new', 'b'])
  })

  it('inserts a block after the last root block', () => {
    const b = new Blocks([block('a')])
    const result = b.addAfter('a', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['a', 'new'])
  })

  it('inserts a block after a nested block', () => {
    const b = new Blocks([new Block('parent', emptyText, [block('child')])])
    const result = b.addAfter('child', block('new'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child', 'new'])
  })

  it('throws if target id does not exist', () => {
    const b = new Blocks([block('a')])
    expect(() => b.addAfter('missing', block('new'))).toThrow()
  })

  it('throws if new block id already exists in the tree', () => {
    const b = new Blocks([block('a'), block('b')])
    expect(() => b.addAfter('a', block('b'))).toThrow()
  })
})

// ─── appendChild ──────────────────────────────────────────────────────────────

describe('appendChild', () => {
  it('appends a block as the last child of the target', () => {
    const b = new Blocks([new Block('parent', emptyText, [block('child1')])])
    const result = b.appendChild('parent', block('child2'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child1', 'child2'])
  })

  it('appends to a block with no existing children', () => {
    const b = new Blocks([block('parent')])
    const result = b.appendChild('parent', block('child'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child'])
  })

  it('appends to a nested target', () => {
    const inner = new Block('inner', emptyText, [block('grandchild')])
    const b = new Blocks([new Block('outer', emptyText, [inner])])
    const result = b.appendChild('inner', block('new'))
    expect(result.blocks[0].children[0].children.map((x) => x.id)).toEqual(['grandchild', 'new'])
  })

  it('throws if target id does not exist', () => {
    const b = new Blocks([block('a')])
    expect(() => b.appendChild('missing', block('child'))).toThrow()
  })

  it('throws if new block id already exists', () => {
    const b = new Blocks([block('a'), block('b')])
    expect(() => b.appendChild('a', block('b'))).toThrow()
  })
})

// ─── prependChild ─────────────────────────────────────────────────────────────

describe('prependChild', () => {
  it('prepends a block as the first child of the target', () => {
    const b = new Blocks([new Block('parent', emptyText, [block('child1')])])
    const result = b.prependChild('parent', block('new'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['new', 'child1'])
  })

  it('prepends to a block with no existing children', () => {
    const b = new Blocks([block('parent')])
    const result = b.prependChild('parent', block('child'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child'])
  })

  it('throws if target id does not exist', () => {
    const b = new Blocks([block('a')])
    expect(() => b.prependChild('missing', block('child'))).toThrow()
  })

  it('throws if new block id already exists', () => {
    const b = new Blocks([block('a'), block('b')])
    expect(() => b.prependChild('a', block('b'))).toThrow()
  })
})

// ─── update ───────────────────────────────────────────────────────────────────

describe('update', () => {
  it('updates the data of a root block', () => {
    const b = new Blocks([new Block('a', helloText, [])])
    const result = b.update('a', worldText)
    expect(result.blocks[0].data).toBe(worldText)
  })

  it('updates the data of a nested block', () => {
    const child = new Block('child', helloText, [])
    const b = new Blocks([new Block('parent', emptyText, [child])])
    const result = b.update('child', worldText)
    expect(result.blocks[0].children[0].data).toBe(worldText)
  })

  it('does not mutate the original', () => {
    const b = new Blocks([new Block('a', helloText, [])])
    b.update('a', worldText)
    expect(b.blocks[0].data).toBe(helloText)
  })

  it('preserves children when updating data', () => {
    const child = block('child')
    const b = new Blocks([new Block('parent', helloText, [child])])
    const result = b.update('parent', worldText)
    expect(result.blocks[0].children[0].id).toBe('child')
  })

  it('throws if target id does not exist', () => {
    const b = new Blocks([block('a')])
    expect(() => b.update('missing', worldText)).toThrow()
  })
})

// ─── delete ───────────────────────────────────────────────────────────────────

describe('delete', () => {
  it('deletes a root leaf block', () => {
    const b = new Blocks([block('a'), block('b')])
    const result = b.delete('a')
    expect(result.blocks.map((x) => x.id)).toEqual(['b'])
  })

  it('deletes a nested leaf block', () => {
    const b = new Blocks([new Block('parent', emptyText, [block('child')])])
    const result = b.delete('child')
    expect(result.blocks[0].children).toHaveLength(0)
  })

  it('can delete all children one by one, leaving parent as a leaf', () => {
    const b = new Blocks([
      new Block('parent', emptyText, [block('c1'), block('c2'), block('c3')]),
    ])
    const r1 = b.delete('c1')
    expect(r1.blocks[0].children.map((x) => x.id)).toEqual(['c2', 'c3'])
    const r2 = r1.delete('c2')
    expect(r2.blocks[0].children.map((x) => x.id)).toEqual(['c3'])
    const r3 = r2.delete('c3')
    expect(r3.blocks[0].children).toHaveLength(0)
  })

  it('throws if the block has children', () => {
    const b = new Blocks([new Block('parent', emptyText, [block('child')])])
    expect(() => b.delete('parent')).toThrow()
  })

  it('throws if target id does not exist', () => {
    const b = new Blocks([block('a')])
    expect(() => b.delete('missing')).toThrow()
  })

  it('throws if deleting would leave the root Blocks empty', () => {
    const b = new Blocks([block('a')])
    expect(() => b.delete('a')).toThrow()
  })

  it('plan example: deleting A or B throws because they have children', () => {
    // Tree: A → [B → [C]]
    const c = block('C')
    const bBlock = new Block('B', emptyText, [c])
    const a = new Block('A', emptyText, [bBlock])
    const b = new Blocks([a])
    expect(() => b.delete('A')).toThrow()
    expect(() => b.delete('B')).toThrow()
    // Correct sequence: delete C, then B, then A
    const r1 = b.delete('C')
    const r2 = r1.delete('B')
    // Cannot delete A without another root block
    expect(() => r2.delete('A')).toThrow()
  })
})