import { Text, TextDto } from '../text/text'

export type BlockId = string

export type BlockDto = {
  id: BlockId
  data: TextDto
  children: ReadonlyArray<BlockDto>
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function collectAllIds(blocks: ReadonlyArray<Block>): string[] {
  const result: string[] = []
  for (const block of blocks) {
    result.push(block.id)
    result.push(...collectAllIds(block.children))
  }
  return result
}

function dtoToBlock(dto: BlockDto): Block {
  return new Block(dto.id, new Text(dto.data.text, [...dto.data.inline]), dto.children.map(dtoToBlock))
}

function treeInsertBefore(
  blocks: ReadonlyArray<Block>,
  targetId: BlockId,
  newBlock: Block
): ReadonlyArray<Block> | null {
  const result: Block[] = []
  let found = false
  for (const block of blocks) {
    if (block.id === targetId) {
      result.push(newBlock, block)
      found = true
    } else {
      const newChildren = treeInsertBefore(block.children, targetId, newBlock)
      if (newChildren !== null) {
        result.push(new Block(block.id, block.data, newChildren))
        found = true
      } else {
        result.push(block)
      }
    }
  }
  return found ? result : null
}

function treeInsertAfter(
  blocks: ReadonlyArray<Block>,
  targetId: BlockId,
  newBlock: Block
): ReadonlyArray<Block> | null {
  const result: Block[] = []
  let found = false
  for (const block of blocks) {
    if (block.id === targetId) {
      result.push(block, newBlock)
      found = true
    } else {
      const newChildren = treeInsertAfter(block.children, targetId, newBlock)
      if (newChildren !== null) {
        result.push(new Block(block.id, block.data, newChildren))
        found = true
      } else {
        result.push(block)
      }
    }
  }
  return found ? result : null
}

function treeAppendChild(
  blocks: ReadonlyArray<Block>,
  targetId: BlockId,
  newBlock: Block
): ReadonlyArray<Block> | null {
  const result: Block[] = []
  let found = false
  for (const block of blocks) {
    if (block.id === targetId) {
      result.push(new Block(block.id, block.data, [...block.children, newBlock]))
      found = true
    } else {
      const newChildren = treeAppendChild(block.children, targetId, newBlock)
      if (newChildren !== null) {
        result.push(new Block(block.id, block.data, newChildren))
        found = true
      } else {
        result.push(block)
      }
    }
  }
  return found ? result : null
}

function treePrependChild(
  blocks: ReadonlyArray<Block>,
  targetId: BlockId,
  newBlock: Block
): ReadonlyArray<Block> | null {
  const result: Block[] = []
  let found = false
  for (const block of blocks) {
    if (block.id === targetId) {
      result.push(new Block(block.id, block.data, [newBlock, ...block.children]))
      found = true
    } else {
      const newChildren = treePrependChild(block.children, targetId, newBlock)
      if (newChildren !== null) {
        result.push(new Block(block.id, block.data, newChildren))
        found = true
      } else {
        result.push(block)
      }
    }
  }
  return found ? result : null
}

function treeUpdate(
  blocks: ReadonlyArray<Block>,
  targetId: BlockId,
  data: Text
): ReadonlyArray<Block> | null {
  const result: Block[] = []
  let found = false
  for (const block of blocks) {
    if (block.id === targetId) {
      result.push(new Block(block.id, data, block.children))
      found = true
    } else {
      const newChildren = treeUpdate(block.children, targetId, data)
      if (newChildren !== null) {
        result.push(new Block(block.id, block.data, newChildren))
        found = true
      } else {
        result.push(block)
      }
    }
  }
  return found ? result : null
}

function treeDelete(
  blocks: ReadonlyArray<Block>,
  targetId: BlockId
): ReadonlyArray<Block> | null {
  const result: Block[] = []
  let found = false
  for (const block of blocks) {
    if (block.id === targetId) {
      if (block.children.length > 0) {
        throw new Error(
          `Cannot delete block '${targetId}': it has children. Delete all children first.`
        )
      }
      found = true
    } else {
      const newChildren = treeDelete(block.children, targetId)
      if (newChildren !== null) {
        result.push(new Block(block.id, block.data, newChildren))
        found = true
      } else {
        result.push(block)
      }
    }
  }
  return found ? result : null
}

// ─── range helpers ────────────────────────────────────────────────────────────

type TraversalEntry = { id: BlockId; depth: number }

function flatTraversal(blocks: ReadonlyArray<Block>, depth = 0): TraversalEntry[] {
  const result: TraversalEntry[] = []
  for (const block of blocks) {
    result.push({ id: block.id, depth })
    result.push(...flatTraversal(block.children, depth + 1))
  }
  return result
}

function getBlocksInRange(
  blocks: ReadonlyArray<Block>,
  fromId: BlockId,
  toId: BlockId
): BlockId[] {
  const entries = flatTraversal(blocks)
  const fromIdx = entries.findIndex(e => e.id === fromId)
  const toIdx = entries.findIndex(e => e.id === toId)
  if (fromIdx === -1) throw new Error(`Block '${fromId}' not found`)
  if (toIdx === -1) throw new Error(`Block '${toId}' not found`)
  if (toIdx < fromIdx) throw new Error(`'${toId}' appears before '${fromId}' in document order`)
  return entries.slice(fromIdx, toIdx + 1).map(e => e.id)
}

// ─── indent helpers ────────────────────────────────────────────────────────────

function treeIndentBlock(
  blocks: ReadonlyArray<Block>,
  id: BlockId,
  rangeSet: ReadonlySet<BlockId>,
  moved: Set<BlockId>
): { result: ReadonlyArray<Block>; found: boolean } {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) {
      if (i === 0) return { result: blocks, found: true } // no previous sibling

      const blockToMove = blocks[i]
      const prevSib = blocks[i - 1]

      // Partition children: range children travel with the block;
      // non-range children are extracted to the new parent after the block.
      const rangeChildren = blockToMove.children.filter(c => rangeSet.has(c.id))
      const nonRangeChildren = blockToMove.children.filter(c => !rangeSet.has(c.id))

      // Mark range children (and their descendants) as already moved
      function markMoved(bs: ReadonlyArray<Block>) {
        for (const b of bs) {
          moved.add(b.id)
          markMoved(b.children)
        }
      }
      markMoved(rangeChildren)

      const newBlock = new Block(blockToMove.id, blockToMove.data, rangeChildren)
      const newPrevSib = new Block(
        prevSib.id,
        prevSib.data,
        [...prevSib.children, newBlock, ...nonRangeChildren]
      )
      const result: Block[] = [...blocks.slice(0, i - 1), newPrevSib, ...blocks.slice(i + 1)]
      return { result, found: true }
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const { result: newChildren, found } = treeIndentBlock(
      blocks[i].children, id, rangeSet, moved
    )
    if (found) {
      const result: Block[] = [
        ...blocks.slice(0, i),
        new Block(blocks[i].id, blocks[i].data, newChildren),
        ...blocks.slice(i + 1),
      ]
      return { result, found: true }
    }
  }

  return { result: blocks, found: false }
}

// ─── unindent helpers ──────────────────────────────────────────────────────────

function treeUnindentBlock(
  blocks: ReadonlyArray<Block>,
  id: BlockId
): { result: ReadonlyArray<Block>; found: boolean } {
  for (let i = 0; i < blocks.length; i++) {
    const parent = blocks[i]
    const childIdx = parent.children.findIndex(c => c.id === id)

    if (childIdx !== -1) {
      const blockToMove = parent.children[childIdx]
      const followingSiblings = parent.children.slice(childIdx + 1)

      const newBlock = new Block(
        blockToMove.id,
        blockToMove.data,
        [...blockToMove.children, ...followingSiblings]
      )
      const newParent = new Block(parent.id, parent.data, parent.children.slice(0, childIdx))
      const result: Block[] = [
        ...blocks.slice(0, i),
        newParent,
        newBlock,
        ...blocks.slice(i + 1),
      ]
      return { result, found: true }
    }

    const { result: newChildren, found } = treeUnindentBlock(parent.children, id)
    if (found) {
      const result: Block[] = [
        ...blocks.slice(0, i),
        new Block(parent.id, parent.data, newChildren),
        ...blocks.slice(i + 1),
      ]
      return { result, found: true }
    }
  }

  return { result: blocks, found: false }
}

// ─── Block class ──────────────────────────────────────────────────────────────

export class Block {
  constructor(
    public readonly id: BlockId,
    public readonly data: Text,
    public readonly children: ReadonlyArray<Block>
  ) {
    if (id.length === 0) throw new Error('Block id must be at least one character long')
  }
}

// ─── Blocks class ─────────────────────────────────────────────────────────────

export class Blocks {
  constructor(public readonly blocks: ReadonlyArray<Block>) {
    if (blocks.length === 0) throw new Error('Blocks must contain at least one block')
    const allIds = collectAllIds(blocks)
    if (new Set(allIds).size !== allIds.length) {
      throw new Error('All block IDs must be unique across the entire tree')
    }
  }

  /**
   * Constructs a `Blocks` instance from plain DTO data, recursively converting
   * nested children.
   * @throws if the array is empty (via constructor).
   */
  static from(dto: ReadonlyArray<BlockDto>): Blocks {
    return new Blocks(dto.map(dtoToBlock))
  }

  /**
   * Returns a new `Blocks` with `block` inserted immediately before the block
   * identified by `id` at the same level in the tree.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  addBefore(id: BlockId, block: Block): Blocks {
    const result = treeInsertBefore(this.blocks, id, block)
    if (result === null) throw new Error(`No block with id '${id}' found`)
    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` with `block` inserted immediately after the block
   * identified by `id` at the same level in the tree.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  addAfter(id: BlockId, block: Block): Blocks {
    const result = treeInsertAfter(this.blocks, id, block)
    if (result === null) throw new Error(`No block with id '${id}' found`)
    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` with `block` appended to the end of the children
   * of the block identified by `id`.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  appendChild(id: BlockId, block: Block): Blocks {
    const result = treeAppendChild(this.blocks, id, block)
    if (result === null) throw new Error(`No block with id '${id}' found`)
    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` with `block` prepended to the beginning of the
   * children of the block identified by `id`.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  prependChild(id: BlockId, block: Block): Blocks {
    const result = treePrependChild(this.blocks, id, block)
    if (result === null) throw new Error(`No block with id '${id}' found`)
    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` with the matching block's `data` replaced by
   * the given `Text`.
   * @throws if no block with `id` exists.
   */
  update(id: BlockId, data: Text): Blocks {
    const result = treeUpdate(this.blocks, id, data)
    if (result === null) throw new Error(`No block with id '${id}' found`)
    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` where each block in the pre-order range [`from`, `to`]
   * (that is not already moved) is appended to its previous sibling.
   * - Children in the range travel with the block.
   * - Children not in the range are extracted and placed after the block in the new parent.
   * - Blocks with no previous sibling are silently skipped.
   * @throws if `from` or `to` are not found, or `to` precedes `from`.
   */
  indent(from: BlockId, to: BlockId): Blocks {
    const ids = getBlocksInRange(this.blocks, from, to)
    const rangeSet = new Set(ids)
    const moved = new Set<BlockId>()
    let result = this.blocks

    for (const id of ids) {
      if (moved.has(id)) continue
      const { result: newResult, found } = treeIndentBlock(result, id, rangeSet, moved)
      if (!found) throw new Error(`Block '${id}' not found during indent`)
      result = newResult
    }

    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` where each block in the pre-order range [`from`, `to`]
   * is moved to be the immediate successor of its parent at the parent's level.
   * Following siblings of the block become its new children (appended after existing ones).
   * Root-level blocks are silently skipped.
   * @throws if `from` or `to` are not found, or `to` precedes `from`.
   */
  unindent(from: BlockId, to: BlockId): Blocks {
    const ids = getBlocksInRange(this.blocks, from, to)
    let result = this.blocks

    for (const id of ids) {
      const { result: newResult } = treeUnindentBlock(result, id)
      result = newResult
    }

    return new Blocks(result)
  }

  /**
   * Returns a new `Blocks` with the block identified by `id` removed.
   * @throws if no block with `id` exists.
   * @throws if the block has children (delete children first).
   * @throws if deleting would leave the root `Blocks` instance empty (via constructor).
   */
  delete(id: BlockId): Blocks {
    const result = treeDelete(this.blocks, id)
    if (result === null) throw new Error(`No block with id '${id}' found`)
    return new Blocks(result)
  }
}