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