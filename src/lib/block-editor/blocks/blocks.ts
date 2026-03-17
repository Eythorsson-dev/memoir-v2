import { Text, type TextDto, type InlineDto } from '../text/text'

export type BlockId = string

// ─── Public types ──────────────────────────────────────────────────────────────

export class Block {
  constructor(
    readonly id: BlockId,
    readonly data: TextDto,
    readonly children: ReadonlyArray<Block>,
  ) {
    Object.freeze(this)
  }

  /**
   * Returns the length of this block's content.
   * Abstracted so future block types with non-text content can override.
   */
  getLength(): number {
    return this.data.text.length
  }
}

export class BlockOffset {
  constructor(
    readonly blockId: BlockId,
    readonly offset: number,
  ) {
    if (blockId.length === 0) throw new Error('blockId must be non-empty')
    if (offset < 0) throw new Error(`offset must be >= 0, got ${offset}`)
    Object.freeze(this)
  }
}

export class BlockRange {
  constructor(
    readonly start: BlockOffset,
    readonly end: BlockOffset,
  ) {
    if (start.blockId === end.blockId && start.offset === end.offset) {
      throw new Error('BlockRange must not be collapsed (start equals end)')
    }
    Object.freeze(this)
  }
}

export type BlocksChange =
  | { type: 'moved';        id: BlockId; previousBlockId: BlockId | null; parentBlockId: BlockId | null }
  | { type: 'removed';      id: BlockId }
  | { type: 'added';        id: BlockId; data: TextDto; previousBlockId: BlockId | null; parentBlockId: BlockId | null }
  | { type: 'dataChanged';  id: BlockId; data: TextDto }

// ─── Internal types ────────────────────────────────────────────────────────────

/**
 * Internal flat representation used within blocks.ts.
 * Stores a block's id, parsed Text data, and indent level.
 * Not exported — external code should use Block (the tree DTO class).
 */
class FlatBlock {
  constructor(
    readonly id: BlockId,
    readonly data: Text,
    readonly indent: number,
  ) {
    Object.freeze(this)
  }
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(blocks: ReadonlyArray<FlatBlock>): void {
  if (blocks.length === 0) throw new Error('Blocks must contain at least one block')

  const seenIds = new Set<string>()
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    if (block.id.length === 0) throw new Error('Block id must be at least one character long')
    if (seenIds.has(block.id)) throw new Error(`Duplicate block id: '${block.id}'`)
    seenIds.add(block.id)

    if (!Number.isInteger(block.indent) || block.indent < 0) {
      throw new Error(`Block '${block.id}' has invalid indent: ${block.indent}`)
    }
    if (i === 0 && block.indent !== 0) {
      throw new Error(`First block must have indent 0, got ${block.indent}`)
    }
    if (i > 0 && block.indent > blocks[i - 1].indent + 1) {
      throw new Error(
        `Block '${block.id}' indent (${block.indent}) exceeds previous block indent + 1 (${blocks[i - 1].indent + 1})`
      )
    }
  }
}

// ─── Clamp helper ─────────────────────────────────────────────────────────────

/** Restores max-step validity across the entire flat list. */
function clampPass(blocks: FlatBlock[]): FlatBlock[] {
  const clamped: FlatBlock[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (i === 0) {
      clamped.push(new FlatBlock(block.id, block.data, 0))
    } else {
      const maxAllowed = clamped[i - 1].indent + 1
      const newIndent = Math.min(block.indent, maxAllowed)
      clamped.push(new FlatBlock(block.id, block.data, newIndent))
    }
  }
  return clamped
}

// ─── Block (tree DTO) → FlatBlock conversion ──────────────────────────────────

function dtoToFlat(dtos: ReadonlyArray<Block>, depth = 0, result: FlatBlock[] = []): FlatBlock[] {
  for (const dto of dtos) {
    result.push(new FlatBlock(dto.id, new Text(dto.data.text, [...dto.data.inline] as InlineDto[]), depth))
    dtoToFlat(dto.children, depth + 1, result)
  }
  return result
}

// ─── FlatBlock → Block (tree DTO) conversion ──────────────────────────────────

function flatToDto(blocks: ReadonlyArray<FlatBlock>): ReadonlyArray<Block> {
  type MutableBlock = { id: BlockId; data: TextDto; children: MutableBlock[] }

  const roots: MutableBlock[] = []
  const stack: Array<{ node: MutableBlock; indent: number }> = []

  for (const block of blocks) {
    const node: MutableBlock = {
      id: block.id,
      data: { text: block.data.text, inline: [...block.data.inline] as InlineDto[] },
      children: [],
    }
    while (stack.length > 0 && stack[stack.length - 1].indent >= block.indent) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }
    stack.push({ node, indent: block.indent })
  }

  function buildBlock(node: MutableBlock): Block {
    return new Block(node.id, node.data, node.children.map(buildBlock))
  }

  return roots.map(buildBlock)
}

// ─── Range helper ──────────────────────────────────────────────────────────────

function getRange(blocks: ReadonlyArray<FlatBlock>, fromId: BlockId, toId: BlockId): [number, number] {
  const fromIdx = blocks.findIndex(b => b.id === fromId)
  const toIdx = blocks.findIndex(b => b.id === toId)
  if (fromIdx === -1) throw new Error(`Block '${fromId}' not found`)
  if (toIdx === -1) throw new Error(`Block '${toId}' not found`)
  if (toIdx < fromIdx) throw new Error(`'${toId}' appears before '${fromId}' in document order`)
  return [fromIdx, toIdx]
}

// ─── Blocks class ─────────────────────────────────────────────────────────────

export class Blocks {
  #blocks: ReadonlyArray<FlatBlock>

  private constructor(blocks: ReadonlyArray<FlatBlock>) {
    validate(blocks)
    this.#blocks = blocks
    Object.freeze(this)
  }

  static from(dtos: ReadonlyArray<Block>): Blocks {
    return new Blocks(dtoToFlat(dtos))
  }

  /**
   * Creates a Block with a generated UUID, defaulting data and children.
   * All code that constructs new blocks should use this method so that
   * ID generation is centralised.
   */
  static createBlock(data?: TextDto, children?: ReadonlyArray<Block>): Block {
    return new Block(
      crypto.randomUUID(),
      data ?? { text: '', inline: [] },
      children ?? [],
    )
  }

  get blocks(): ReadonlyArray<Block> {
    return flatToDto(this.#blocks)
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  /** Returns the Block DTO (with full subtree) for the given id. */
  getBlock(id: BlockId): Block {
    function search(blocks: ReadonlyArray<Block>): Block | undefined {
      for (const b of blocks) {
        if (b.id === id) return b
        const found = search(b.children)
        if (found) return found
      }
    }
    const result = search(flatToDto(this.#blocks))
    if (!result) throw new Error(`Block not found: ${id}`)
    return result
  }

  /** Returns the ID immediately before `id` in pre-order flat sequence, or null if first. */
  previousBlockId(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    return idx === 0 ? null : this.#blocks[idx - 1].id
  }

  /** Returns the ID immediately after `id` in pre-order flat sequence, or null if last. */
  nextBlockId(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    return idx === this.#blocks.length - 1 ? null : this.#blocks[idx + 1].id
  }

  /**
   * Returns the first block after the entire subtree of `id` whose indent ≤ indent(id).
   * i.e. the next sibling, or parent's next sibling, etc. Returns null if none exists.
   */
  nextSiblingOrNextAscendantSiblingId(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    const targetIndent = this.#blocks[idx].indent
    for (let i = idx + 1; i < this.#blocks.length; i++) {
      if (this.#blocks[i].indent <= targetIndent) return this.#blocks[i].id
    }
    return null
  }

  /** Returns true if the block immediately after `id` in flat order has indent > indent(id). */
  hasChildren(id: BlockId): boolean {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    return idx + 1 < this.#blocks.length && this.#blocks[idx + 1].indent > this.#blocks[idx].indent
  }

  /** Returns the parent block's ID, or null if the block is at the root level. */
  parent(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    const targetIndent = this.#blocks[idx].indent
    if (targetIndent === 0) return null
    for (let i = idx - 1; i >= 0; i--) {
      if (this.#blocks[i].indent === targetIndent - 1) return this.#blocks[i].id
    }
    return null
  }

  /** Returns the previous sibling's ID, or null if this is the first child. */
  prevSibling(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    const targetIndent = this.#blocks[idx].indent
    for (let i = idx - 1; i >= 0; i--) {
      if (this.#blocks[i].indent < targetIndent) return null
      if (this.#blocks[i].indent === targetIndent) return this.#blocks[i].id
    }
    return null
  }

  /** Returns the next sibling's ID, or null if this is the last child. */
  nextSibling(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    const targetIndent = this.#blocks[idx].indent
    for (let i = idx + 1; i < this.#blocks.length; i++) {
      if (this.#blocks[i].indent < targetIndent) return null
      if (this.#blocks[i].indent === targetIndent) return this.#blocks[i].id
    }
    return null
  }

  /**
   * Computes the structural differences between two Blocks states.
   * Returns `removed` entries for blocks present in `oldBlocks` but not in `newBlocks`,
   * and `moved` entries for blocks whose parent or prevSibling changed.
   * Newly added blocks (not present in `oldBlocks`) are ignored.
   */
  static diff(oldBlocks: Blocks, newBlocks: Blocks): BlocksChange[] {
    const changes: BlocksChange[] = []
    const newIds = new Set(newBlocks.#blocks.map(b => b.id))
    const oldIds = new Set(oldBlocks.#blocks.map(b => b.id))
    const oldDataMap = new Map(oldBlocks.#blocks.map(b => [b.id, b.data]))

    for (const b of oldBlocks.#blocks) {
      if (!newIds.has(b.id)) {
        changes.push({ type: 'removed', id: b.id })
      }
    }

    for (const b of newBlocks.#blocks) {
      if (!oldIds.has(b.id)) {
        // New block — report as added
        const newPrev = newBlocks.prevSibling(b.id)
        const newParent = newBlocks.parent(b.id)
        changes.push({
          type: 'added',
          id: b.id,
          data: { text: b.data.text, inline: [...b.data.inline] as InlineDto[] },
          previousBlockId: newPrev,
          parentBlockId: newParent,
        })
        continue
      }

      const oldParent = oldBlocks.parent(b.id)
      const newParent = newBlocks.parent(b.id)
      const oldPrev = oldBlocks.prevSibling(b.id)
      const newPrev = newBlocks.prevSibling(b.id)
      if (oldParent !== newParent || oldPrev !== newPrev) {
        changes.push({ type: 'moved', id: b.id, previousBlockId: newPrev, parentBlockId: newParent })
      }

      const oldData = oldDataMap.get(b.id)!
      if (!oldData.equals(b.data)) {
        changes.push({
          type: 'dataChanged',
          id: b.id,
          data: { text: b.data.text, inline: [...b.data.inline] as InlineDto[] },
        })
      }
    }

    return changes
  }

  // ─── Existing mutation methods ────────────────────────────────────────────────

  /**
   * Returns a new `Blocks` with a block inserted immediately before the block
   * identified by `id`, at the same indent level.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  addBefore(id: BlockId, block: { id: BlockId; data: Text }): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const newBlock = new FlatBlock(block.id, block.data, this.#blocks[idx].indent)
    return new Blocks([
      ...this.#blocks.slice(0, idx),
      newBlock,
      ...this.#blocks.slice(idx),
    ])
  }

  /**
   * Returns a new `Blocks` with a block inserted immediately after the block
   * identified by `id`, at the same indent level.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  addAfter(id: BlockId, block: { id: BlockId; data: Text }): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const newBlock = new FlatBlock(block.id, block.data, this.#blocks[idx].indent)
    return new Blocks([
      ...this.#blocks.slice(0, idx + 1),
      newBlock,
      ...this.#blocks.slice(idx + 1),
    ])
  }

  /**
   * Returns a new `Blocks` with a block appended as the last child of the
   * block identified by `id`.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  appendChild(id: BlockId, block: { id: BlockId; data: Text }): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const targetIndent = this.#blocks[idx].indent
    let insertAt = idx + 1
    while (insertAt < this.#blocks.length && this.#blocks[insertAt].indent > targetIndent) {
      insertAt++
    }
    const newBlock = new FlatBlock(block.id, block.data, targetIndent + 1)
    return new Blocks([
      ...this.#blocks.slice(0, insertAt),
      newBlock,
      ...this.#blocks.slice(insertAt),
    ])
  }

  /**
   * Returns a new `Blocks` with a block prepended as the first child of the
   * block identified by `id`.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  prependChild(id: BlockId, block: { id: BlockId; data: Text }): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const newBlock = new FlatBlock(block.id, block.data, this.#blocks[idx].indent + 1)
    return new Blocks([
      ...this.#blocks.slice(0, idx + 1),
      newBlock,
      ...this.#blocks.slice(idx + 1),
    ])
  }

  /**
   * Returns a new `Blocks` with the matching block's `data` replaced.
   * @throws if no block with `id` exists.
   */
  update(id: BlockId, data: Text): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const updated = [...this.#blocks]
    updated[idx] = new FlatBlock(id, data, this.#blocks[idx].indent)
    return new Blocks(updated)
  }

  /**
   * Returns a new `Blocks` with the block identified by `id` removed.
   * @throws if no block with `id` exists.
   * @throws if the block has descendants (delete them first).
   * @throws if deleting would leave the list empty (via constructor).
   */
  delete(id: BlockId): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const targetIndent = this.#blocks[idx].indent
    if (idx + 1 < this.#blocks.length && this.#blocks[idx + 1].indent > targetIndent) {
      throw new Error(`Cannot delete block '${id}': it has children. Delete all children first.`)
    }
    return new Blocks([
      ...this.#blocks.slice(0, idx),
      ...this.#blocks.slice(idx + 1),
    ])
  }

  /**
   * Returns a new `Blocks` where each block in the pre-order range [`from`, `to`]
   * has its indent incremented by 1, subject to the evolving-state rule.
   * @throws if `from` or `to` are not found, or `to` precedes `from`.
   */
  indent(from: BlockId, to: BlockId): Blocks {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    const rangeIds = new Set(this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id))
    const updated = [...this.#blocks]

    for (let i = 0; i < updated.length; i++) {
      if (!rangeIds.has(updated[i].id)) continue
      if (i === 0) continue  // no previous block — silently skip
      const prevIndent = updated[i - 1].indent  // evolving state
      if (updated[i].indent <= prevIndent) {
        updated[i] = new FlatBlock(updated[i].id, updated[i].data, updated[i].indent + 1)
      }
    }

    return new Blocks(updated)
  }

  /**
   * Returns a new `Blocks` where each block in the pre-order range [`from`, `to`]
   * has its indent decremented by 1, followed by a clamping pass.
   * @throws if `from` or `to` are not found, or `to` precedes `from`.
   */
  unindent(from: BlockId, to: BlockId): Blocks {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    const rangeIds = new Set(this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id))

    const decremented = this.#blocks.map(block => ({
      block,
      indent: rangeIds.has(block.id) ? Math.max(0, block.indent - 1) : block.indent,
    }))

    const preClamped = decremented.map(({ block, indent }) => new FlatBlock(block.id, block.data, indent))
    return new Blocks(clampPass(preClamped))
  }

  // ─── Editor-support methods ───────────────────────────────────────────────────

  /**
   * Split block `id` at text `offset`. The left part stays in `id`; the right
   * part becomes a new same-indent sibling inserted immediately after `id`.
   */
  splitAt(id: BlockId, offset: number, newId: BlockId): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    const block = this.#blocks[idx]
    if (offset < 0 || offset > block.data.text.length) {
      throw new RangeError(`offset ${offset} out of bounds for block '${id}'`)
    }
    const [leftText, rightText] = block.data.split(offset)
    return new Blocks([
      ...this.#blocks.slice(0, idx),
      new FlatBlock(id, leftText, block.indent),
      new FlatBlock(newId, rightText, block.indent),
      ...this.#blocks.slice(idx + 1),
    ])
  }

  /**
   * Merges the right block into the left block.
   * The right block's text is appended to the left block's text.
   * The right block is then removed from the flat list.
   * If the right block has children, they are kept in place and a clamping
   * pass is applied (same logic as unindent) to restore max-step validity.
   */
  merge(left: BlockId, right: BlockId): Blocks {
    const leftIdx = this.#blocks.findIndex(b => b.id === left)
    const rightIdx = this.#blocks.findIndex(b => b.id === right)
    if (leftIdx === -1) throw new Error(`Block not found: ${left}`)
    if (rightIdx === -1) throw new Error(`Block not found: ${right}`)
    if (rightIdx !== leftIdx + 1) {
      throw new Error(`'${right}' is not immediately after '${left}' in flat order`)
    }
    const leftBlock = this.#blocks[leftIdx]
    const rightBlock = this.#blocks[rightIdx]
    const mergedData = Text.merge(leftBlock.data, rightBlock.data)
    const updated = [
      ...this.#blocks.slice(0, leftIdx),
      new FlatBlock(left, mergedData, leftBlock.indent),
      ...this.#blocks.slice(rightIdx + 1),
    ]
    return new Blocks(clampPass(updated))
  }

  /**
   * Deletes the content described by selection.
   * The left part of the start block is merged with the right part of the
   * end block. All blocks strictly between them, the end block itself, and
   * all end-block descendants are removed.
   */
  deleteRange(selection: BlockRange): Blocks {
    const { start, end } = selection
    const startIdx = this.#blocks.findIndex(b => b.id === start.blockId)
    const endIdx = this.#blocks.findIndex(b => b.id === end.blockId)
    if (startIdx === -1) throw new Error(`Block not found: ${start.blockId}`)
    if (endIdx === -1) throw new Error(`Block not found: ${end.blockId}`)

    const startBlock = this.#blocks[startIdx]
    const endBlock = this.#blocks[endIdx]

    if (start.blockId === end.blockId) {
      // Same block: remove text between offsets
      const length = end.offset - start.offset
      const newText = startBlock.data.remove(start.offset, length)
      const updated = [...this.#blocks]
      updated[startIdx] = new FlatBlock(start.blockId, newText, startBlock.indent)
      return new Blocks(updated)
    }

    if (startIdx > endIdx) {
      throw new Error(`'${start.blockId}' does not precede '${end.blockId}' in document order`)
    }

    // Find end of end block's subtree
    const endIndent = endBlock.indent
    let endSubtreeEnd = endIdx + 1
    while (endSubtreeEnd < this.#blocks.length && this.#blocks[endSubtreeEnd].indent > endIndent) {
      endSubtreeEnd++
    }

    const [leftText] = startBlock.data.split(start.offset)
    const [, rightText] = endBlock.data.split(end.offset)
    const mergedText = Text.merge(leftText, rightText)

    const newBlocks = [
      ...this.#blocks.slice(0, startIdx),
      new FlatBlock(start.blockId, mergedText, startBlock.indent),
      ...this.#blocks.slice(endSubtreeEnd),
    ]

    return new Blocks(clampPass(newBlocks))
  }
}
