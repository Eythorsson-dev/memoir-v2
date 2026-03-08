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

// ─── helpers ──────────────────────────────────────────────────────────────────

function preorder(blocks: Blocks): string[] {
  function walk(bs: ReadonlyArray<Block>): string[] {
    const result: string[] = []
    for (const b of bs) {
      result.push(b.id)
      result.push(...walk(b.children))
    }
    return result
  }
  return walk(blocks.blocks)
}

/** Find a block anywhere in the tree */
function find(blocks: Blocks, id: string): Block {
  function search(bs: ReadonlyArray<Block>): Block | undefined {
    for (const b of bs) {
      if (b.id === id) return b
      const found = search(b.children)
      if (found) return found
    }
  }
  const result = search(blocks.blocks)
  if (!result) throw new Error(`Block '${id}' not found`)
  return result
}

// ─── indent ───────────────────────────────────────────────────────────────────

describe('indent', () => {
  // S1 – no previous sibling → no change
  it('skips a block that has no previous sibling (S1)', () => {
    // Before: A, B[C, D], E
    const before = new Blocks([
      block('A'),
      new Block('B', emptyText, [block('C'), block('D')]),
      block('E'),
    ])
    const result = before.indent('C', 'C')
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // S2 – single block with previous sibling
  it('indents a single block into its predecessor (S2)', () => {
    // Before: A, B, C
    const before = new Blocks([block('A'), block('B'), block('C')])
    const result = before.indent('B', 'B')
    expect(preorder(result)).toEqual(['A', 'B', 'C'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B'])
  })

  // S3 – range stops before a nested block → child extracted
  it('extracts non-range children and places them after the moved block (S3)', () => {
    // Before: A[B], C[D], E   indent(B,C)  range=[B,C], D not in range
    const before = new Blocks([
      new Block('A', emptyText, [block('B')]),
      new Block('C', emptyText, [block('D')]),
      block('E'),
    ])
    const result = before.indent('B', 'C')
    // After: A[B, C, D], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C', 'D'])
    expect(find(result, 'C').children).toHaveLength(0)
  })

  // S4 – range includes nested block → child travels with parent
  it('keeps range children with their parent when block moves (S4)', () => {
    // Before: A[B], C[D], E   indent(B,D)  range=[B,C,D], D in range
    const before = new Blocks([
      new Block('A', emptyText, [block('B')]),
      new Block('C', emptyText, [block('D')]),
      block('E'),
    ])
    const result = before.indent('B', 'D')
    // After: A[B, C[D]], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
    expect(find(result, 'C').children.map((x) => x.id)).toEqual(['D'])
  })

  // S5 – multiple flat blocks all indent into the same predecessor
  it('indents multiple consecutive flat blocks (S5)', () => {
    // Before: A, B, C, D, E   indent(B,C)
    const before = new Blocks([
      block('A'), block('B'), block('C'), block('D'), block('E'),
    ])
    const result = before.indent('B', 'C')
    // After: A[B, C], D, E
    expect(result.blocks.map((x) => x.id)).toEqual(['A', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
  })

  // S6 – block's children are all in range → all travel with block
  it('moves a block with all children when they are all in range (S6)', () => {
    // Before: A, B[C, D], E   indent(B,D)
    const before = new Blocks([
      block('A'),
      new Block('B', emptyText, [block('C'), block('D')]),
      block('E'),
    ])
    const result = before.indent('B', 'D')
    // After: A[B[C, D]], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B'])
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // S7 – first block skipped, rest indent
  it('skips the first block when it has no predecessor and indents the rest (S7)', () => {
    // Before: A, B, C, D   indent(A,C)
    const before = new Blocks([block('A'), block('B'), block('C'), block('D')])
    const result = before.indent('A', 'C')
    // A skipped, B→A, C→A
    expect(result.blocks.map((x) => x.id)).toEqual(['A', 'D'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
  })

  it('throws if from is not found', () => {
    const b = new Blocks([block('A')])
    expect(() => b.indent('X', 'A')).toThrow()
  })

  it('throws if to is not found', () => {
    const b = new Blocks([block('A')])
    expect(() => b.indent('A', 'X')).toThrow()
  })

  it('throws if to comes before from in document order', () => {
    const b = new Blocks([block('A'), block('B'), block('C')])
    expect(() => b.indent('C', 'A')).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = new Blocks([block('A'), block('B')])
    const result = b.indent('B', 'B')
    expect(result).not.toBe(b)
  })
})

// ─── unindent ─────────────────────────────────────────────────────────────────

describe('unindent', () => {
  // U1 – simple unindent, no following siblings
  it('moves a block to after its parent when it has no following siblings (U1)', () => {
    // Before: A[B[C]]   unindent(C,C)
    const before = new Blocks([
      new Block('A', emptyText, [
        new Block('B', emptyText, [block('C')]),
      ]),
    ])
    const result = before.unindent('C', 'C')
    // After: A[B, C]
    expect(preorder(result)).toEqual(['A', 'B', 'C'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
    expect(find(result, 'B').children).toHaveLength(0)
  })

  // U2 – following siblings become children
  it('makes following siblings children of the unindented block (U2)', () => {
    // Before: A[B, C, D], E   unindent(B,B)
    const before = new Blocks([
      new Block('A', emptyText, [block('B'), block('C'), block('D')]),
      block('E'),
    ])
    const result = before.unindent('B', 'B')
    // After: A, B[C, D], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // U3 – partial following siblings
  it('only takes following siblings, not preceding ones (U3)', () => {
    // Before: A[B[C, D, E]]   unindent(C,C)
    const before = new Blocks([
      new Block('A', emptyText, [
        new Block('B', emptyText, [block('C'), block('D'), block('E')]),
      ]),
    ])
    const result = before.unindent('C', 'C')
    // After: A[B, C[D, E]]
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'B').children).toHaveLength(0)
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
    expect(find(result, 'C').children.map((x) => x.id)).toEqual(['D', 'E'])
  })

  // U4 – range unindent (two consecutive children)
  it('processes a range of siblings sequentially (U4)', () => {
    // Before: A[B, C, D], E   unindent(B,C)
    const before = new Blocks([
      new Block('A', emptyText, [block('B'), block('C'), block('D')]),
      block('E'),
    ])
    const result = before.unindent('B', 'C')
    // After: A, B, C[D], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children).toHaveLength(0)
    expect(find(result, 'C').children.map((x) => x.id)).toEqual(['D'])
  })

  // U5 – existing children + following siblings merge
  it('appends following siblings after existing children (U5)', () => {
    // Before: A[B[X, Y], C], D   unindent(B,B)
    const before = new Blocks([
      new Block('A', emptyText, [
        new Block('B', emptyText, [block('X'), block('Y')]),
        block('C'),
      ]),
      block('D'),
    ])
    const result = before.unindent('B', 'B')
    // After: A, B[X, Y, C], D
    expect(preorder(result)).toEqual(['A', 'B', 'X', 'Y', 'C', 'D'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['X', 'Y', 'C'])
  })

  // U6 – root-level blocks skipped
  it('silently skips root-level blocks (U6)', () => {
    // Before: A, B
    const before = new Blocks([block('A'), block('B')])
    const result = before.unindent('A', 'A')
    expect(preorder(result)).toEqual(['A', 'B'])
  })

  it('throws if from is not found', () => {
    const b = new Blocks([block('A')])
    expect(() => b.unindent('X', 'A')).toThrow()
  })

  it('throws if to is not found', () => {
    const b = new Blocks([block('A')])
    expect(() => b.unindent('A', 'X')).toThrow()
  })

  it('throws if to comes before from in document order', () => {
    const b = new Blocks([
      new Block('A', emptyText, [block('B'), block('C')]),
    ])
    expect(() => b.unindent('C', 'B')).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = new Blocks([
      new Block('A', emptyText, [block('B')]),
    ])
    const result = b.unindent('B', 'B')
    expect(result).not.toBe(b)
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