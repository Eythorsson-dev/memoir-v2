import { describe, it, expect } from 'vitest'
import { Blocks, Block, BlockOffset, BlockRange, BlockMoved, BlockRemoved, BlockAdded, BlockDataChanged } from './blocks'
import { Text } from '../text/text'

// ─── helpers ──────────────────────────────────────────────────────────────────

const emptyText = new Text('', [])
const helloText = new Text('Hello', [])
const worldText = new Text('World', [])

/** Build a Block (tree format) for use with Blocks.from */
function dto(id: string, text = '', children: Block[] = []): Block {
  return new Block(id, { text, inline: [] }, children)
}

/** Build a block arg for use with mutation methods (addBefore, addAfter, etc.) */
function block(id: string, data: Text = emptyText): { id: string; data: Text } {
  return { id, data }
}

/** Pre-order traversal of block IDs */
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

/** Find a Block anywhere in the tree */
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

// ─── Blocks.from ──────────────────────────────────────────────────────────────

describe('Blocks.from', () => {
  it('creates a Blocks instance from a flat DTO array', () => {
    const b = Blocks.from([dto('a', 'Hello')])
    expect(b.blocks).toHaveLength(1)
    expect(b.blocks[0].id).toBe('a')
    expect(b.blocks[0].data.text).toBe('Hello')
  })

  it('recursively converts nested children', () => {
    const b = Blocks.from([
      dto('parent', 'Parent', [dto('child', 'Child')]),
    ])
    expect(b.blocks[0].children).toHaveLength(1)
    expect(b.blocks[0].children[0].id).toBe('child')
    expect(b.blocks[0].children[0].data.text).toBe('Child')
  })

  it('preserves nested block structure with multiple root and child blocks', () => {
    const b = Blocks.from([
      dto('block-1', 'Hello World', [dto('block-2', 'This is a test')]),
      dto('block-3', 'This is another'),
    ])
    expect(b.blocks).toHaveLength(2)
    expect(b.blocks[0].id).toBe('block-1')
    expect(b.blocks[0].children[0].id).toBe('block-2')
    expect(b.blocks[1].id).toBe('block-3')
  })

  it('throws if array is empty', () => {
    expect(() => Blocks.from([])).toThrow()
  })

  it('throws if root-level blocks have duplicate IDs', () => {
    expect(() => Blocks.from([dto('a'), dto('a')])).toThrow()
  })

  it('throws if a nested block has the same ID as a root block', () => {
    expect(() => Blocks.from([dto('a', '', [dto('a')])])).toThrow()
  })

  it('throws if two nested blocks share an ID', () => {
    expect(() => Blocks.from([dto('parent', '', [dto('dup'), dto('dup')])])).toThrow()
  })

  it('throws if block id is empty string', () => {
    expect(() => Blocks.from([new Block('', { text: '', inline: [] }, [])])).toThrow()
  })
})

// ─── addBefore ────────────────────────────────────────────────────────────────

describe('addBefore', () => {
  it('inserts a block before the target at root level', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    const result = b.addBefore('b', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['a', 'new', 'b'])
  })

  it('inserts a block before the first root block', () => {
    const b = Blocks.from([dto('a')])
    const result = b.addBefore('a', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['new', 'a'])
  })

  it('inserts a block before a nested block at the same indent', () => {
    const b = Blocks.from([dto('parent', '', [dto('child')])])
    const result = b.addBefore('child', block('new'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['new', 'child'])
  })

  it('throws if target id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.addBefore('missing', block('new'))).toThrow()
  })

  it('throws if new block id already exists in the tree', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(() => b.addBefore('b', block('a'))).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = Blocks.from([dto('a')])
    const result = b.addBefore('a', block('new'))
    expect(result).not.toBe(b)
    expect(b.blocks).toHaveLength(1)
  })
})

// ─── addAfter ─────────────────────────────────────────────────────────────────

describe('addAfter', () => {
  it('inserts a block after the target at root level', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    const result = b.addAfter('a', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['a', 'new', 'b'])
  })

  it('inserts a block after the last root block', () => {
    const b = Blocks.from([dto('a')])
    const result = b.addAfter('a', block('new'))
    expect(result.blocks.map((x) => x.id)).toEqual(['a', 'new'])
  })

  it('inserts a block after a nested block at the same indent', () => {
    const b = Blocks.from([dto('parent', '', [dto('child')])])
    const result = b.addAfter('child', block('new'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child', 'new'])
  })

  it('throws if target id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.addAfter('missing', block('new'))).toThrow()
  })

  it('throws if new block id already exists in the tree', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(() => b.addAfter('a', block('b'))).toThrow()
  })
})

// ─── appendChild ──────────────────────────────────────────────────────────────

describe('appendChild', () => {
  it('appends a block as the last child of the target', () => {
    const b = Blocks.from([dto('parent', '', [dto('child1')])])
    const result = b.appendChild('parent', block('child2'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child1', 'child2'])
  })

  it('appends to a block with no existing children', () => {
    const b = Blocks.from([dto('parent')])
    const result = b.appendChild('parent', block('child'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child'])
  })

  it('appends to a nested target (after its subtree)', () => {
    const b = Blocks.from([dto('outer', '', [dto('inner', '', [dto('grandchild')])])])
    const result = b.appendChild('inner', block('new'))
    expect(result.blocks[0].children[0].children.map((x) => x.id)).toEqual(['grandchild', 'new'])
  })

  it('throws if target id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.appendChild('missing', block('child'))).toThrow()
  })

  it('throws if new block id already exists', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(() => b.appendChild('a', block('b'))).toThrow()
  })
})

// ─── prependChild ─────────────────────────────────────────────────────────────

describe('prependChild', () => {
  it('prepends a block as the first child of the target', () => {
    const b = Blocks.from([dto('parent', '', [dto('child1')])])
    const result = b.prependChild('parent', block('new'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['new', 'child1'])
  })

  it('prepends to a block with no existing children', () => {
    const b = Blocks.from([dto('parent')])
    const result = b.prependChild('parent', block('child'))
    expect(result.blocks[0].children.map((x) => x.id)).toEqual(['child'])
  })

  it('throws if target id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.prependChild('missing', block('child'))).toThrow()
  })

  it('throws if new block id already exists', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(() => b.prependChild('a', block('b'))).toThrow()
  })
})

// ─── update ───────────────────────────────────────────────────────────────────

describe('update', () => {
  it('updates the data of a root block', () => {
    const b = Blocks.from([dto('a', 'Hello')])
    const result = b.update('a', worldText)
    expect(result.blocks[0].data.text).toBe('World')
  })

  it('updates the data of a nested block', () => {
    const b = Blocks.from([dto('parent', '', [dto('child', 'Hello')])])
    const result = b.update('child', worldText)
    expect(result.blocks[0].children[0].data.text).toBe('World')
  })

  it('does not mutate the original', () => {
    const b = Blocks.from([dto('a', 'Hello')])
    b.update('a', worldText)
    expect(b.blocks[0].data.text).toBe('Hello')
  })

  it('preserves children when updating data', () => {
    const b = Blocks.from([dto('parent', 'Hello', [dto('child')])])
    const result = b.update('parent', worldText)
    expect(result.blocks[0].children[0].id).toBe('child')
  })

  it('throws if target id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.update('missing', worldText)).toThrow()
  })
})

// ─── indent ───────────────────────────────────────────────────────────────────

describe('indent', () => {
  // S1 – block can't go deeper (already at max indent relative to predecessor)
  it('skips a block whose indent already exceeds its predecessor (S1)', () => {
    // Before: A, B[C, D], E — flat [A:0, B:0, C:1, D:1, E:0]
    const before = Blocks.from([dto('A'), dto('B', '', [dto('C'), dto('D')]), dto('E')])
    const result = before.indent('C', 'C')
    // C.indent(1) > A=prev... wait: C's prev is B(0), C.indent(1) <= 0? No → skip
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // S2 – single block with previous sibling
  it('indents a single block that has room to go deeper (S2)', () => {
    // Before: A, B, C — flat [A:0, B:0, C:0]
    const before = Blocks.from([dto('A'), dto('B'), dto('C')])
    const result = before.indent('B', 'B')
    expect(preorder(result)).toEqual(['A', 'B', 'C'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B'])
  })

  // S3 – C is indented into A; D was already a sibling of B under A at indent=1,
  //      so after C moves to indent=1 it and D become siblings of B under A
  it('non-range block at same indent level becomes sibling of indented block (S3)', () => {
    // Before: A[B], C[D], E — flat [A:0, B:1, C:0, D:1, E:0]
    const before = Blocks.from([dto('A', '', [dto('B')]), dto('C', '', [dto('D')]), dto('E')])
    const result = before.indent('B', 'C')
    // B: prev=A(0), B.indent(1)<=0? No → skip
    // C: prev=B(1), C.indent(0)<=1 → increment to 1
    // After flat: [A:0, B:1, C:1, D:1, E:0] → A[B, C, D], E
    // (C and D are at the same indent=1, so D is a sibling of C, both under A)
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C', 'D'])
    expect(find(result, 'C').children).toHaveLength(0)
  })

  // S4 – range includes a nested block
  it('indents a range that includes nested blocks (S4)', () => {
    // Before: A[B], C[D], E — flat [A:0, B:1, C:0, D:1, E:0]
    const before = Blocks.from([dto('A', '', [dto('B')]), dto('C', '', [dto('D')]), dto('E')])
    const result = before.indent('B', 'D')
    // B: skip (1>0), C: →1, D: prev=C(1), D.indent(1)<=1 →2
    // After flat: [A:0, B:1, C:1, D:2, E:0] → A[B, C[D]], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
    expect(find(result, 'C').children.map((x) => x.id)).toEqual(['D'])
  })

  // S5 – multiple consecutive flat blocks
  it('indents multiple consecutive flat blocks (S5)', () => {
    // Before: A, B, C, D, E — flat all at 0
    const before = Blocks.from([dto('A'), dto('B'), dto('C'), dto('D'), dto('E')])
    const result = before.indent('B', 'C')
    // B→1, C: prev=B(1), C.indent(0)<=1 → 1
    expect(result.blocks.map((x) => x.id)).toEqual(['A', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
  })

  // S6 – block's children are all in range → they follow their parent deeper
  it('increments a block and its in-range children together (S6)', () => {
    // Before: A, B[C, D], E — flat [A:0, B:0, C:1, D:1, E:0]
    const before = Blocks.from([dto('A'), dto('B', '', [dto('C'), dto('D')]), dto('E')])
    const result = before.indent('B', 'D')
    // B→1, C: prev=B(1), C.indent(1)<=1 →2, D: prev=C(2), D.indent(1)<=2 →2
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B'])
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // S7 – first block in list is silently skipped; rest indent
  it('silently skips the first block and indents the rest of the range (S7)', () => {
    // Before: A, B, C, D — flat all at 0
    const before = Blocks.from([dto('A'), dto('B'), dto('C'), dto('D')])
    const result = before.indent('A', 'C')
    // A: i=0 → skip; B: prev=A(0), →1; C: prev=B(1), →1
    expect(result.blocks.map((x) => x.id)).toEqual(['A', 'D'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
  })

  // New: evolving-state skip — B is already deeper than A so it is skipped,
  // but C still gets incremented using B's (unchanged) indent as the reference
  it('uses evolving state: skips block whose indent exceeds updated predecessor (new-1)', () => {
    // Before: A[B, C], D — flat [A:0, B:1, C:1, D:0]
    const before = Blocks.from([dto('A', '', [dto('B'), dto('C')]), dto('D')])
    const result = before.indent('A', 'C')
    // A: i=0 → skip; B: prev=A(0), B.indent(1)<=0? No → skip; C: prev=B(1), C.indent(1)<=1 →2
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B'])
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C'])
  })

  // New: cross-level range — range spans blocks at different indent levels
  it('handles a range that crosses indent levels (new-2)', () => {
    // Before: A[B, C], D, E — flat [A:0, B:1, C:1, D:0, E:0]
    const before = Blocks.from([dto('A', '', [dto('B'), dto('C')]), dto('D'), dto('E')])
    const result = before.indent('C', 'D')
    // C: prev=B(1), C.indent(1)<=1 →2; D: prev=C(now 2), D.indent(0)<=2 →1
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'D'])
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C'])
    expect(find(result, 'D').children).toHaveLength(0)
  })

  // New: single-block — first block in list is always skipped
  it('single-block indent of the first block is a no-op (new-3)', () => {
    const before = Blocks.from([dto('A'), dto('B')])
    const result = before.indent('A', 'A')
    expect(preorder(result)).toEqual(['A', 'B'])
    expect(result.blocks[0].children).toHaveLength(0)
  })

  // New: single-block — block already at max indent relative to predecessor
  it('single-block indent is a no-op when block is already at max depth (new-4)', () => {
    // Before: A[B] — flat [A:0, B:1]; B.indent(1) > A.indent(0), skip
    const before = Blocks.from([dto('A', '', [dto('B')])])
    const result = before.indent('B', 'B')
    expect(preorder(result)).toEqual(['A', 'B'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B'])
  })

  it('throws if from is not found', () => {
    const b = Blocks.from([dto('A')])
    expect(() => b.indent('X', 'A')).toThrow()
  })

  it('throws if to is not found', () => {
    const b = Blocks.from([dto('A')])
    expect(() => b.indent('A', 'X')).toThrow()
  })

  it('throws if to comes before from in document order', () => {
    const b = Blocks.from([dto('A'), dto('B'), dto('C')])
    expect(() => b.indent('C', 'A')).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = Blocks.from([dto('A'), dto('B')])
    const result = b.indent('B', 'B')
    expect(result).not.toBe(b)
  })
})

// ─── unindent ─────────────────────────────────────────────────────────────────

describe('unindent', () => {
  // U1 – simple unindent: block's indent decrements and it becomes a sibling of its former parent
  it('decrements a nested block to become a sibling of its parent (U1)', () => {
    // Before: A[B[C]] — flat [A:0, B:1, C:2]
    const before = Blocks.from([dto('A', '', [dto('B', '', [dto('C')])])])
    const result = before.unindent('C', 'C')
    // C: 2→1. Clamp: C(1)≤B(1)+1=2 → stays 1
    // After flat: [A:0, B:1, C:1] → A[B, C]
    expect(preorder(result)).toEqual(['A', 'B', 'C'])
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
    expect(find(result, 'B').children).toHaveLength(0)
  })

  // U2 – unindent causes following blocks to be re-parented via tree reconstruction
  it('re-parents following blocks when a block is unindented (U2)', () => {
    // Before: A[B, C, D], E — flat [A:0, B:1, C:1, D:1, E:0]
    const before = Blocks.from([dto('A', '', [dto('B'), dto('C'), dto('D')]), dto('E')])
    const result = before.unindent('B', 'B')
    // B: 1→0. Clamp: C(1)≤B(0)+1=1 → 1, D(1)≤C(1)+1=2 → 1
    // After flat: [A:0, B:0, C:1, D:1, E:0] → A, B[C, D], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // U3 – only the targeted block's indent decrements; deeper descendants stay relative to it
  it('keeps descendants relative to the unindented block (U3)', () => {
    // Before: A[B[C, D, E]] — flat [A:0, B:1, C:2, D:2, E:2]
    const before = Blocks.from([dto('A', '', [dto('B', '', [dto('C'), dto('D'), dto('E')])])])
    const result = before.unindent('C', 'C')
    // C: 2→1. D and E stay at 2. Clamp: D(2)≤C(1)+1=2 → 2, E(2)≤D(2)+1=3 → 2
    // After: [A:0, B:1, C:1, D:2, E:2] → A[B, C[D, E]]
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'B').children).toHaveLength(0)
    expect(find(result, 'A').children.map((x) => x.id)).toEqual(['B', 'C'])
    expect(find(result, 'C').children.map((x) => x.id)).toEqual(['D', 'E'])
  })

  // U4 – range unindent: multiple blocks decremented together
  it('decrements a range of blocks and clamps descendants (U4)', () => {
    // Before: A[B, C, D], E — flat [A:0, B:1, C:1, D:1, E:0]
    const before = Blocks.from([dto('A', '', [dto('B'), dto('C'), dto('D')]), dto('E')])
    const result = before.unindent('B', 'C')
    // B→0, C→0. Clamp: D(1)≤C(0)+1=1 → 1
    // After: [A:0, B:0, C:0, D:1, E:0] → A, B, C[D], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children).toHaveLength(0)
    expect(find(result, 'C').children.map((x) => x.id)).toEqual(['D'])
  })

  // U5 – clamping cascade: descendants of unindented block are clamped down
  //      (updated expectation vs old tree model — Y stays child of X after clamp)
  it('clamps cascade preserves descendant relationships after unindent (U5)', () => {
    // Before: A[B[X, Y], C], D — flat [A:0, B:1, X:2, Y:2, C:1, D:0]
    const before = Blocks.from([
      dto('A', '', [dto('B', '', [dto('X'), dto('Y')]), dto('C')]),
      dto('D'),
    ])
    const result = before.unindent('B', 'B')
    // B: 1→0. Clamp: X(2)>B(0)+1=1 → clamped to 1; Y(2)≤X(1)+1=2 → stays 2; C(1)≤Y(2)+1=3 → 1
    // After flat: [A:0, B:0, X:1, Y:2, C:1, D:0] → A, B[X[Y], C], D
    expect(preorder(result)).toEqual(['A', 'B', 'X', 'Y', 'C', 'D'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['X', 'C'])
    expect(find(result, 'X').children.map((x) => x.id)).toEqual(['Y'])
  })

  // U6 – blocks already at indent 0 are silently skipped
  it('silently skips root-level blocks (U6)', () => {
    // Before: A, B — flat [A:0, B:0]
    const before = Blocks.from([dto('A'), dto('B')])
    const result = before.unindent('A', 'A')
    expect(preorder(result)).toEqual(['A', 'B'])
  })

  // New: clamping cascade example from the plan
  it('cascades the clamp pass to restore max-step validity across the whole list (new-1)', () => {
    // Before: A[B[C], D], E — flat [A:0, B:1, C:2, D:1, E:0]
    const before = Blocks.from([
      dto('A', '', [dto('B', '', [dto('C')]), dto('D')]),
      dto('E'),
    ])
    const result = before.unindent('A', 'B')
    // A: 0→0 (stays); B: 1→0. Clamp: C(2)>B(0)+1=1 → 1; D(1)≤C(1)+1=2 → 1
    // After flat: [A:0, B:0, C:1, D:1, E:0] → A, B[C, D], E
    expect(preorder(result)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(find(result, 'A').children).toHaveLength(0)
    expect(find(result, 'B').children.map((x) => x.id)).toEqual(['C', 'D'])
  })

  // New: single-block unindent of a block already at indent 0
  it('single-block unindent of a root-level block is a no-op (new-2)', () => {
    const before = Blocks.from([dto('A'), dto('B')])
    const result = before.unindent('A', 'A')
    expect(preorder(result)).toEqual(['A', 'B'])
  })

  it('throws if from is not found', () => {
    const b = Blocks.from([dto('A')])
    expect(() => b.unindent('X', 'A')).toThrow()
  })

  it('throws if to is not found', () => {
    const b = Blocks.from([dto('A')])
    expect(() => b.unindent('A', 'X')).toThrow()
  })

  it('throws if to comes before from in document order', () => {
    const b = Blocks.from([dto('A', '', [dto('B'), dto('C')])])
    expect(() => b.unindent('C', 'B')).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = Blocks.from([dto('A', '', [dto('B')])])
    const result = b.unindent('B', 'B')
    expect(result).not.toBe(b)
  })
})

// ─── delete ───────────────────────────────────────────────────────────────────

describe('delete', () => {
  it('deletes a root leaf block', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    const result = b.delete('a')
    expect(result.blocks.map((x) => x.id)).toEqual(['b'])
  })

  it('deletes a nested leaf block', () => {
    const b = Blocks.from([dto('parent', '', [dto('child')])])
    const result = b.delete('child')
    expect(result.blocks[0].children).toHaveLength(0)
  })

  it('can delete all children one by one, leaving parent as a leaf', () => {
    const b = Blocks.from([dto('parent', '', [dto('c1'), dto('c2'), dto('c3')])])
    const r1 = b.delete('c1')
    expect(r1.blocks[0].children.map((x) => x.id)).toEqual(['c2', 'c3'])
    const r2 = r1.delete('c2')
    expect(r2.blocks[0].children.map((x) => x.id)).toEqual(['c3'])
    const r3 = r2.delete('c3')
    expect(r3.blocks[0].children).toHaveLength(0)
  })

  it('throws if the block has children', () => {
    const b = Blocks.from([dto('parent', '', [dto('child')])])
    expect(() => b.delete('parent')).toThrow()
  })

  it('throws if target id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.delete('missing')).toThrow()
  })

  it('throws if deleting would leave the root Blocks empty', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.delete('a')).toThrow()
  })

  it('plan example: deleting A or B throws because they have children', () => {
    // Tree: A → [B → [C]]
    const b = Blocks.from([dto('A', '', [dto('B', '', [dto('C')])])])
    expect(() => b.delete('A')).toThrow()
    expect(() => b.delete('B')).toThrow()
    // Correct sequence: delete C, then B, then A
    const r1 = b.delete('C')
    const r2 = r1.delete('B')
    // Cannot delete A without another root block
    expect(() => r2.delete('A')).toThrow()
  })
})

// ─── Block.getLength ──────────────────────────────────────────────────────────

describe('Block.getLength', () => {
  it('returns the text length of the block data', () => {
    const b = new Block('a', { text: 'Hello', inline: [] }, [])
    expect(b.getLength()).toBe(5)
  })

  it('returns 0 for empty text', () => {
    const b = new Block('a', { text: '', inline: [] }, [])
    expect(b.getLength()).toBe(0)
  })
})

// ─── Blocks.createBlock ───────────────────────────────────────────────────────

describe('Blocks.createBlock', () => {
  it('creates a block with a UUID id', () => {
    const b = Blocks.createBlock()
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('creates a block with empty data and children when no args given', () => {
    const b = Blocks.createBlock()
    expect(b.data.text).toBe('')
    expect(b.data.inline).toHaveLength(0)
    expect(b.children).toHaveLength(0)
  })

  it('uses the provided data', () => {
    const b = Blocks.createBlock({ text: 'Hello', inline: [] })
    expect(b.data.text).toBe('Hello')
  })

  it('generates unique IDs each time', () => {
    const a = Blocks.createBlock()
    const b = Blocks.createBlock()
    expect(a.id).not.toBe(b.id)
  })
})

// ─── getBlock ─────────────────────────────────────────────────────────────────

describe('getBlock', () => {
  it('returns a root block with its children', () => {
    const b = Blocks.from([dto('a', 'Hello', [dto('b', 'World')])])
    const result = b.getBlock('a')
    expect(result.id).toBe('a')
    expect(result.data.text).toBe('Hello')
    expect(result.children).toHaveLength(1)
    expect(result.children[0].id).toBe('b')
  })

  it('returns a nested block with its subtree', () => {
    const b = Blocks.from([dto('parent', '', [dto('child', 'Hi', [dto('grandchild', 'Yo')])])])
    const result = b.getBlock('child')
    expect(result.id).toBe('child')
    expect(result.children).toHaveLength(1)
    expect(result.children[0].id).toBe('grandchild')
  })

  it("throws 'Block not found: <id>' if id does not exist", () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.getBlock('missing')).toThrow('Block not found: missing')
  })
})

// ─── previousBlockId ─────────────────────────────────────────────────────────

describe('previousBlockId', () => {
  it('returns null for the first block', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(b.previousBlockId('a')).toBeNull()
  })

  it('returns the previous block in pre-order flat sequence', () => {
    const b = Blocks.from([dto('a'), dto('b'), dto('c')])
    expect(b.previousBlockId('b')).toBe('a')
    expect(b.previousBlockId('c')).toBe('b')
  })

  it('returns the parent when a nested block is first child', () => {
    // flat: [parent:0, child:1]
    const b = Blocks.from([dto('parent', '', [dto('child')])])
    expect(b.previousBlockId('child')).toBe('parent')
  })

  it('throws if id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.previousBlockId('missing')).toThrow('Block not found: missing')
  })
})

// ─── nextBlockId ─────────────────────────────────────────────────────────────

describe('nextBlockId', () => {
  it('returns null for the last block', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(b.nextBlockId('b')).toBeNull()
  })

  it('returns the next block in pre-order flat sequence', () => {
    const b = Blocks.from([dto('a'), dto('b'), dto('c')])
    expect(b.nextBlockId('a')).toBe('b')
    expect(b.nextBlockId('b')).toBe('c')
  })

  it('returns the first child when the block has children', () => {
    // flat: [parent:0, child:1]
    const b = Blocks.from([dto('parent', '', [dto('child')])])
    expect(b.nextBlockId('parent')).toBe('child')
  })

  it('throws if id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.nextBlockId('missing')).toThrow('Block not found: missing')
  })
})

// ─── nextSiblingOrNextAscendantSiblingId ──────────────────────────────────────

describe('nextSiblingOrNextAscendantSiblingId', () => {
  it('returns the next sibling when one exists', () => {
    // flat: [a:0, b:0, c:0]
    const b = Blocks.from([dto('a'), dto('b'), dto('c')])
    expect(b.nextSiblingOrNextAscendantSiblingId('a')).toBe('b')
  })

  it("returns parent's next sibling when block is the last child", () => {
    // flat: [a:0, b:1, c:0] — b is last child of a; c is a's next sibling
    const b = Blocks.from([dto('a', '', [dto('b')]), dto('c')])
    expect(b.nextSiblingOrNextAscendantSiblingId('b')).toBe('c')
  })

  it('skips over the entire subtree to find the next non-descendant', () => {
    // flat: [a:0, b:1, c:2, d:0]
    const b = Blocks.from([dto('a', '', [dto('b', '', [dto('c')])]), dto('d')])
    expect(b.nextSiblingOrNextAscendantSiblingId('a')).toBe('d')
    expect(b.nextSiblingOrNextAscendantSiblingId('b')).toBe('d')
  })

  it('returns null if the block and its subtree end the document', () => {
    const b = Blocks.from([dto('a'), dto('b', '', [dto('c')])])
    expect(b.nextSiblingOrNextAscendantSiblingId('b')).toBeNull()
    expect(b.nextSiblingOrNextAscendantSiblingId('c')).toBeNull()
  })

  it('throws if id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.nextSiblingOrNextAscendantSiblingId('missing')).toThrow('Block not found: missing')
  })
})

// ─── hasChildren ──────────────────────────────────────────────────────────────

describe('hasChildren', () => {
  it('returns true when the block has children', () => {
    const b = Blocks.from([dto('a', '', [dto('b')])])
    expect(b.hasChildren('a')).toBe(true)
  })

  it('returns false when the block has no children', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(b.hasChildren('a')).toBe(false)
    expect(b.hasChildren('b')).toBe(false)
  })

  it('returns false for the last block even if previous sibling has children', () => {
    const b = Blocks.from([dto('a', '', [dto('b')]), dto('c')])
    expect(b.hasChildren('c')).toBe(false)
  })

  it('throws if id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.hasChildren('missing')).toThrow('Block not found: missing')
  })
})

// ─── splitAt ─────────────────────────────────────────────────────────────────

describe('splitAt', () => {
  it('splits a block at a mid-text offset', () => {
    const b = Blocks.from([dto('a', 'Hello World')])
    const result = b.splitAt('a', 5, 'b')
    expect(preorder(result)).toEqual(['a', 'b'])
    expect(find(result, 'a').data.text).toBe('Hello')
    expect(find(result, 'b').data.text).toBe(' World')
  })

  it('splits at offset 0 — left is empty, right has all text', () => {
    const b = Blocks.from([dto('a', 'Hello')])
    const result = b.splitAt('a', 0, 'b')
    expect(find(result, 'a').data.text).toBe('')
    expect(find(result, 'b').data.text).toBe('Hello')
  })

  it('splits at end — left has all text, right is empty', () => {
    const b = Blocks.from([dto('a', 'Hello')])
    const result = b.splitAt('a', 5, 'b')
    expect(find(result, 'a').data.text).toBe('Hello')
    expect(find(result, 'b').data.text).toBe('')
  })

  it('new block is inserted at same indent as original', () => {
    // flat: [parent:0, child:1] — split child
    const b = Blocks.from([dto('parent', '', [dto('child', 'Hi')])])
    const result = b.splitAt('child', 1, 'new')
    // new should be at same indent as child (both children of parent)
    expect(find(result, 'parent').children.map(x => x.id)).toEqual(['child', 'new'])
  })

  it("new block inherits the original block's children", () => {
    // flat: [a:0, b:1] — split 'a'; b comes after 'a' in flat, so b becomes child of new
    const b = Blocks.from([dto('a', 'Hello', [dto('b')])])
    const result = b.splitAt('a', 3, 'new')
    expect(preorder(result)).toEqual(['a', 'new', 'b'])
    // 'b' at indent 1 is now under 'new' (indent 0)
    expect(find(result, 'new').children.map(x => x.id)).toEqual(['b'])
  })

  it('throws if id does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.splitAt('missing', 0, 'new')).toThrow('Block not found: missing')
  })

  it('throws if newId already exists', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(() => b.splitAt('a', 0, 'b')).toThrow()
  })

  it('throws if offset is out of bounds', () => {
    const b = Blocks.from([dto('a', 'Hi')])
    expect(() => b.splitAt('a', 10, 'new')).toThrow()
  })
})

// ─── merge ────────────────────────────────────────────────────────────────────

describe('merge', () => {
  it('appends right text to left text', () => {
    const b = Blocks.from([dto('a', 'Hello'), dto('b', ' World')])
    const result = b.merge('a', 'b')
    expect(find(result, 'a').data.text).toBe('Hello World')
  })

  it('removes the right block', () => {
    const b = Blocks.from([dto('a', 'Hello'), dto('b', ' World')])
    const result = b.merge('a', 'b')
    expect(preorder(result)).toEqual(['a'])
  })

  it("keeps right block's children in place after merge, re-parenting via clamping", () => {
    // flat: [a:0, b:0, c:1] — merge a and b; c was b's child
    const b = Blocks.from([dto('a', 'Hello'), dto('b', ' World', [dto('c', 'Child')])])
    const result = b.merge('a', 'b')
    // flat after: [a:0, c:1] — c becomes child of a
    expect(preorder(result)).toEqual(['a', 'c'])
    expect(find(result, 'a').children.map(x => x.id)).toEqual(['c'])
  })

  it('applies clamping when right block children would be too deep', () => {
    // flat: [parent:0, left:1, right:2, child:3]
    const b = Blocks.from([
      dto('parent', '', [
        dto('left', 'L'),
        dto('right', 'R', [dto('child', 'C')]),
      ]),
    ])
    const result = b.merge('left', 'right')
    // After removing right: [parent:0, left:1, child:3]
    // Clamp: parent(0), left(1≤0+1=1 ✓), child(3>1+1=2 → 2)
    expect(preorder(result)).toEqual(['parent', 'left', 'child'])
    expect(find(result, 'left').children.map(x => x.id)).toEqual(['child'])
  })

  it('throws if left does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.merge('missing', 'a')).toThrow('Block not found: missing')
  })

  it('throws if right does not exist', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.merge('a', 'missing')).toThrow('Block not found: missing')
  })

  it('throws if right is not immediately after left in flat order', () => {
    const b = Blocks.from([dto('a'), dto('b'), dto('c')])
    expect(() => b.merge('a', 'c')).toThrow()
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = Blocks.from([dto('a', 'Hello'), dto('b', ' World')])
    const result = b.merge('a', 'b')
    expect(result).not.toBe(b)
  })
})

// ─── deleteRange ──────────────────────────────────────────────────────────────

describe('deleteRange', () => {
  it('same block: removes text between start and end offsets', () => {
    const b = Blocks.from([dto('a', 'Hello World')])
    const sel = new BlockRange(new BlockOffset('a', 5), new BlockOffset('a', 11))
    const result = b.deleteRange(sel)
    expect(find(result, 'a').data.text).toBe('Hello')
  })

  it('same block: removes text in the middle', () => {
    const b = Blocks.from([dto('a', 'Hello World')])
    const sel = new BlockRange(new BlockOffset('a', 5), new BlockOffset('a', 6))
    const result = b.deleteRange(sel)
    expect(find(result, 'a').data.text).toBe('HelloWorld')
  })

  it('multi-block: merges start and end blocks, removes everything between', () => {
    const b = Blocks.from([dto('a', 'Hello'), dto('b', 'Middle'), dto('c', 'World')])
    // delete from offset 2 in 'a' to offset 3 in 'c'
    const sel = new BlockRange(new BlockOffset('a', 2), new BlockOffset('c', 3))
    const result = b.deleteRange(sel)
    expect(preorder(result)).toEqual(['a'])
    expect(find(result, 'a').data.text).toBe('Held')  // 'He' + 'ld' (World[3..])
  })

  it('multi-block: removes end block and its descendants', () => {
    // flat: [a:0, b:0, c:1]
    const b = Blocks.from([dto('a', 'AAA'), dto('b', 'BBB', [dto('c', 'CCC')])])
    const sel = new BlockRange(new BlockOffset('a', 1), new BlockOffset('b', 1))
    const result = b.deleteRange(sel)
    // remove b (and c as its descendant); a gets 'A' + 'BB'
    expect(preorder(result)).toEqual(['a'])
    expect(find(result, 'a').data.text).toBe('ABB')
  })

  it('multi-block: keeps blocks after end block', () => {
    const b = Blocks.from([dto('a', 'AAA'), dto('b', 'BBB'), dto('c', 'CCC')])
    const sel = new BlockRange(new BlockOffset('a', 1), new BlockOffset('b', 1))
    const result = b.deleteRange(sel)
    expect(preorder(result)).toEqual(['a', 'c'])
    expect(find(result, 'a').data.text).toBe('ABB')
  })

  it('BlockRange throws if start equals end (same block and offset)', () => {
    expect(() => new BlockRange(new BlockOffset('a', 2), new BlockOffset('a', 2))).toThrow()
  })

  it('throws if start block does not exist', () => {
    const b = Blocks.from([dto('a')])
    const sel = new BlockRange(new BlockOffset('missing', 0), new BlockOffset('a', 0))
    expect(() => b.deleteRange(sel)).toThrow('Block not found: missing')
  })

  it('throws if end block does not exist', () => {
    const b = Blocks.from([dto('a')])
    const sel = new BlockRange(new BlockOffset('a', 0), new BlockOffset('missing', 0))
    expect(() => b.deleteRange(sel)).toThrow('Block not found: missing')
  })

  it('returns a new Blocks instance (immutable)', () => {
    const b = Blocks.from([dto('a', 'Hello'), dto('b', 'World')])
    const sel = new BlockRange(new BlockOffset('a', 2), new BlockOffset('b', 2))
    const result = b.deleteRange(sel)
    expect(result).not.toBe(b)
  })
})

// ─── parent ───────────────────────────────────────────────────────────────────

describe('parent', () => {
  it('returns null for a root-level block', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(b.parent('a')).toBeNull()
    expect(b.parent('b')).toBeNull()
  })

  it('returns the parent id for a direct child', () => {
    const b = Blocks.from([dto('a', '', [dto('b')])])
    expect(b.parent('b')).toBe('a')
  })

  it('returns the correct parent for deeply nested blocks', () => {
    // flat: [a:0, b:1, c:2]
    const b = Blocks.from([dto('a', '', [dto('b', '', [dto('c')])])])
    expect(b.parent('c')).toBe('b')
    expect(b.parent('b')).toBe('a')
  })

  it('returns correct parent for second child (skipping subtree of first child)', () => {
    // flat: [a:0, b:1, c:2, d:1]
    const b = Blocks.from([dto('a', '', [dto('b', '', [dto('c')]), dto('d')])])
    expect(b.parent('d')).toBe('a')
  })

  it('throws for unknown id', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.parent('missing')).toThrow('Block not found: missing')
  })
})

// ─── prevSibling ──────────────────────────────────────────────────────────────

describe('prevSibling', () => {
  it('returns null for first root block', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(b.prevSibling('a')).toBeNull()
  })

  it('returns prev sibling for root-level blocks', () => {
    const b = Blocks.from([dto('a'), dto('b'), dto('c')])
    expect(b.prevSibling('b')).toBe('a')
    expect(b.prevSibling('c')).toBe('b')
  })

  it('returns null when block is first child of its parent', () => {
    const b = Blocks.from([dto('a', '', [dto('b'), dto('c')])])
    expect(b.prevSibling('b')).toBeNull()
  })

  it('returns prev sibling among children', () => {
    const b = Blocks.from([dto('a', '', [dto('b'), dto('c')])])
    expect(b.prevSibling('c')).toBe('b')
  })

  it('skips over subtrees of potential prev sibling', () => {
    // flat: [a:0, b:1, c:2, d:1]  → d.prevSibling = b
    const b = Blocks.from([dto('a', '', [dto('b', '', [dto('c')]), dto('d')])])
    expect(b.prevSibling('d')).toBe('b')
  })

  it('throws for unknown id', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.prevSibling('missing')).toThrow('Block not found: missing')
  })
})

// ─── nextSibling ──────────────────────────────────────────────────────────────

describe('nextSibling', () => {
  it('returns null for last root block', () => {
    const b = Blocks.from([dto('a'), dto('b')])
    expect(b.nextSibling('b')).toBeNull()
  })

  it('returns next sibling for root-level blocks', () => {
    const b = Blocks.from([dto('a'), dto('b'), dto('c')])
    expect(b.nextSibling('a')).toBe('b')
    expect(b.nextSibling('b')).toBe('c')
  })

  it('returns null when block is last child of its parent', () => {
    const b = Blocks.from([dto('a', '', [dto('b'), dto('c')])])
    expect(b.nextSibling('c')).toBeNull()
  })

  it('returns next sibling among children', () => {
    const b = Blocks.from([dto('a', '', [dto('b'), dto('c')])])
    expect(b.nextSibling('b')).toBe('c')
  })

  it('skips over own subtree when finding next sibling', () => {
    // flat: [a:0, b:1, c:2, d:1]  → b.nextSibling = d
    const b = Blocks.from([dto('a', '', [dto('b', '', [dto('c')]), dto('d')])])
    expect(b.nextSibling('b')).toBe('d')
  })

  it('throws for unknown id', () => {
    const b = Blocks.from([dto('a')])
    expect(() => b.nextSibling('missing')).toThrow('Block not found: missing')
  })
})

// ─── Blocks.diff ─────────────────────────────────────────────────────────────

describe('Blocks.diff', () => {
  it('returns empty array for identical states', () => {
    const b = Blocks.from([dto('a'), dto('b', '', [dto('c')])])
    expect(Blocks.diff(b, b)).toEqual([])
  })

  it('returns only dataChanged when content changes but positions do not', () => {
    const b1 = Blocks.from([dto('a', 'hello'), dto('b', 'world')])
    const b2 = b1.update('a', new Text('changed', []))
    const changes = Blocks.diff(b1, b2)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toBeInstanceOf(BlockDataChanged)
    expect(changes[0]).toMatchObject({ id: 'a' })
  })

  it('detects removed blocks', () => {
    const b1 = Blocks.from([dto('a'), dto('b'), dto('c')])
    const b2 = b1.delete('b')
    const changes = Blocks.diff(b1, b2)
    expect(changes).toContainEqual(new BlockRemoved('b'))
    // 'a' is unchanged
    expect(changes).not.toContainEqual(expect.objectContaining({ id: 'a' }))
    // 'c' prevSibling changed from 'b' → 'a', so it gets a moved entry
    expect(changes).toContainEqual(expect.objectContaining({ id: 'c' }))
    expect(changes.find(c => c instanceof BlockMoved && c.id === 'c')).toBeDefined()
  })

  it('detects moved blocks when parent changes (indent)', () => {
    const b1 = Blocks.from([dto('a'), dto('b')])
    const b2 = b1.indent('b', 'b')  // b becomes child of a
    const changes = Blocks.diff(b1, b2)
    const bMoved = changes.find(c => c instanceof BlockMoved && c.id === 'b')
    expect(bMoved).toBeDefined()
    expect(bMoved).toBeInstanceOf(BlockMoved)
    expect(bMoved).toMatchObject({ id: 'b', parentBlockId: 'a', previousBlockId: null })
  })

  it('detects moved blocks when prevSibling changes', () => {
    // After splitting 'a' at offset 0, a new block appears before 'b',
    // changing b's prevSibling from 'a' to the new block.
    const b1 = Blocks.from([dto('a'), dto('b')])
    const b2 = b1.splitAt('a', 0, 'x')  // flat: [a, x, b]
    const changes = Blocks.diff(b1, b2)
    const bMoved = changes.find(c => c instanceof BlockMoved && c.id === 'b')
    expect(bMoved).toBeDefined()
    expect(bMoved).toBeInstanceOf(BlockMoved)
    expect(bMoved).toMatchObject({ id: 'b', previousBlockId: 'x', parentBlockId: null })
  })

  it('reports added for blocks absent from oldBlocks (splitAt)', () => {
    const b1 = Blocks.from([dto('a', 'hello')])
    const b2 = b1.splitAt('a', 3, 'new')  // [a='hel', new='lo']
    const changes = Blocks.diff(b1, b2)
    const addedChange = changes.find(c => c instanceof BlockAdded && c.id === 'new')
    expect(addedChange).toBeDefined()
  })

  it('added change includes correct data, previousBlockId, and parentBlockId', () => {
    const b1 = Blocks.from([dto('a', 'hello'), dto('b')])
    const b2 = b1.splitAt('a', 3, 'new')  // flat: [a='hel', new='lo', b]
    const changes = Blocks.diff(b1, b2)
    const addedChange = changes.find(c => c instanceof BlockAdded && c.id === 'new')
    expect(addedChange).toBeInstanceOf(BlockAdded)
    expect(addedChange).toMatchObject({
      id: 'new',
      data: { text: 'lo', inline: [] },
      previousBlockId: 'a',
      parentBlockId: null,
    })
  })

  it('reports added for a child block with correct parentBlockId', () => {
    const b1 = Blocks.from([dto('a'), dto('b', '', [dto('c')])])
    // Insert a new block after 'b' at same indent (root level)
    const b2 = b1.addAfter('b', { id: 'x', data: new Text('hi', []) })
    const changes = Blocks.diff(b1, b2)
    const addedChange = changes.find(c => c instanceof BlockAdded && c.id === 'x')
    expect(addedChange).toBeInstanceOf(BlockAdded)
    expect(addedChange).toMatchObject({
      id: 'x',
      previousBlockId: 'b',
      parentBlockId: null,
    })
  })

  it('reports dataChanged when update changes block content', () => {
    const b1 = Blocks.from([dto('a', 'hello'), dto('b', 'world')])
    const b2 = b1.update('a', new Text('changed', []))
    const changes = Blocks.diff(b1, b2)
    const dataChanged = changes.find(c => c instanceof BlockDataChanged && c.id === 'a')
    expect(dataChanged).toBeDefined()
    expect(dataChanged).toBeInstanceOf(BlockDataChanged)
    expect(dataChanged).toMatchObject({ id: 'a', data: { text: 'changed', inline: [] } })
  })

  it('reports no dataChanged when data is identical', () => {
    const b1 = Blocks.from([dto('a', 'hello'), dto('b', 'world')])
    const changes = Blocks.diff(b1, b1)
    expect(changes.filter(c => c instanceof BlockDataChanged)).toHaveLength(0)
  })

  it('reports dataChanged only for blocks whose content changed', () => {
    const b1 = Blocks.from([dto('a', 'hello'), dto('b', 'world')])
    const b2 = b1.update('b', new Text('updated', []))
    const changes = Blocks.diff(b1, b2)
    expect(changes.filter(c => c instanceof BlockDataChanged)).toHaveLength(1)
    expect(changes.find(c => c instanceof BlockDataChanged && c.id === 'b')).toBeDefined()
    expect(changes.find(c => c instanceof BlockDataChanged && c.id === 'a')).toBeUndefined()
  })
})

// ─── BlockOffset / BlockRange validation ─────────────────────────────────────

describe('BlockOffset', () => {
  it('throws if blockId is empty', () => {
    expect(() => new BlockOffset('', 0)).toThrow('blockId must be non-empty')
  })

  it('throws if offset is negative', () => {
    expect(() => new BlockOffset('a', -1)).toThrow('offset must be >= 0')
  })

  it('constructs successfully with valid args', () => {
    const bo = new BlockOffset('a', 3)
    expect(bo.blockId).toBe('a')
    expect(bo.offset).toBe(3)
  })
})

// ─── freeze ───────────────────────────────────────────────────────────────────

describe('value objects are frozen', () => {
  it('Block is frozen', () => {
    const b = new Block('a', { text: '', inline: [] }, [])
    expect(() => { (b as any).id = 'z' }).toThrow(TypeError)
  })
  it('BlockOffset is frozen', () => {
    const o = new BlockOffset('a', 0)
    expect(() => { (o as any).offset = 9 }).toThrow(TypeError)
  })
  it('BlockRange is frozen', () => {
    const r = new BlockRange(new BlockOffset('a', 0), new BlockOffset('a', 1))
    expect(() => { (r as any).start = null }).toThrow(TypeError)
  })
})
