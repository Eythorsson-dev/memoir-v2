import { Text, type TextDto } from '../text/text'

export type BlockId = string

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * Abstract base class for all block types.
 * Subclasses hold typed `data` and implement `getLength`, `getText`, and `blockType`.
 */
export abstract class Block<TData> {
  constructor(
    readonly id: BlockId,
    readonly data: TData,
    readonly children: ReadonlyArray<Block<unknown>>,
  ) {
    Object.freeze(this)
  }

  /** Returns the length of this block's content. */
  abstract getLength(): number

  /** Returns the text representation of this block's content. */
  abstract getText(): Text

  /** Identifies the block type. Used to derive `BlockTypes` and drive serialisation. */
  abstract get blockType(): string

  /** Ensures `blockType` is included when serialising with `JSON.stringify`. */
  toJSON() {
    return { id: this.id, data: this.data, children: this.children, blockType: this.blockType }
  }
}

/** A plain text block — the default block type. */
export class TextBlock extends Block<Text> {
  get blockType() { return 'text' as const }

  constructor(
    id: BlockId,
    data: Text,
    children: ReadonlyArray<Block<unknown>>,
  ) {
    super(id, data, children)
  }

  getLength(): number {
    return this.data.text.length
  }

  getText(): Text {
    return this.data
  }
}

/** An ordered-list item block. */
export class OrderedListBlock extends Block<Text> {
  get blockType() { return 'ordered-list' as const }

  constructor(
    id: BlockId,
    data: Text,
    children: ReadonlyArray<Block<unknown>>,
  ) {
    super(id, data, children)
  }

  getLength(): number {
    return this.data.text.length
  }

  getText(): Text {
    return this.data
  }
}

// Derived from the concrete block classes — add new classes to this union
// and BlockTypes updates automatically.
type AnyBlock = TextBlock | OrderedListBlock

/** Union of all valid block type names, derived from concrete block class declarations. */
export type BlockTypes = AnyBlock['blockType']

export class BlockOffset {
  /**
   * @throws {Error} if `blockId` is empty or `offset` is negative.
   */
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
  /**
   * @throws {Error} if `start` and `end` describe the same position (collapsed range).
   */
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

export class BlockMoved {
  constructor(
    readonly id: BlockId,
    readonly previousBlockId: BlockId | null,
    readonly parentBlockId: BlockId | null,
  ) { Object.freeze(this) }
}

export class BlockRemoved {
  constructor(readonly id: BlockId) { Object.freeze(this) }
}

export class BlockAdded {
  constructor(
    readonly id: BlockId,
    readonly data: Text,
    readonly previousBlockId: BlockId | null,
    readonly parentBlockId: BlockId | null,
  ) { Object.freeze(this) }
}

export class BlockDataChanged {
  constructor(
    readonly id: BlockId,
    readonly data: Text,
    readonly blockType: BlockTypes,
  ) { Object.freeze(this) }
}

export type BlocksChange = BlockMoved | BlockRemoved | BlockAdded | BlockDataChanged

// ─── Internal types ────────────────────────────────────────────────────────────

/**
 * Internal flat representation used within blocks.ts.
 * Stores a block's id, parsed Text data, indent level, and block type.
 * Not exported — external code should use TextBlock / OrderedListBlock.
 */
class FlatBlock {
  constructor(
    readonly id: BlockId,
    readonly data: Text,
    readonly indent: number,
    readonly blockType: BlockTypes,
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
      clamped.push(new FlatBlock(block.id, block.data, 0, block.blockType))
    } else {
      const maxAllowed = clamped[i - 1].indent + 1
      const newIndent = Math.min(block.indent, maxAllowed)
      clamped.push(new FlatBlock(block.id, block.data, newIndent, block.blockType))
    }
  }
  return clamped
}

// ─── Block (tree DTO) → FlatBlock conversion ──────────────────────────────────

function dtoToFlat(dtos: ReadonlyArray<AnyBlock>, depth = 0, result: FlatBlock[] = []): FlatBlock[] {
  for (const raw of dtos as ReadonlyArray<unknown>) {
    const dto = raw as Record<string, unknown>
    // Accept both class instances and plain JSON objects (e.g. from localStorage).
    const data: Text = dto['data'] instanceof Text
      ? dto['data']
      : new Text((dto['data'] as TextDto).text, [...(dto['data'] as TextDto).inline])
    const blockType: BlockTypes = (dto['blockType'] as BlockTypes | undefined) ?? 'text'
    result.push(new FlatBlock(dto['id'] as BlockId, data, depth, blockType))
    dtoToFlat((dto['children'] ?? []) as ReadonlyArray<AnyBlock>, depth + 1, result)
  }
  return result
}

// ─── FlatBlock → Block (tree DTO) conversion ──────────────────────────────────

function flatToDto(blocks: ReadonlyArray<FlatBlock>): ReadonlyArray<TextBlock | OrderedListBlock> {
  type MutableBlock = { id: BlockId; data: Text; blockType: BlockTypes; children: MutableBlock[] }

  const roots: MutableBlock[] = []
  const stack: Array<{ node: MutableBlock; indent: number }> = []

  for (const block of blocks) {
    const node: MutableBlock = {
      id: block.id,
      data: block.data,
      blockType: block.blockType,
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

  function buildBlock(node: MutableBlock): TextBlock | OrderedListBlock {
    const children = node.children.map(buildBlock)
    switch (node.blockType) {
      case 'text':
        return new TextBlock(node.id, node.data, children)
      case 'ordered-list':
        return new OrderedListBlock(node.id, node.data, children)
      default: {
        const _exhaustive: never = node.blockType
        throw new Error(`Unknown blockType: ${_exhaustive}`)
      }
    }
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

  /** Creates a `Blocks` instance from an array of tree-structured block DTOs. */
  static from(dtos: ReadonlyArray<Block<unknown>>): Blocks {
    return new Blocks(dtoToFlat(dtos as ReadonlyArray<AnyBlock>))
  }

  /**
   * Creates a `TextBlock` with a generated UUID, defaulting data and children.
   * All code that constructs new text blocks should use this method so that
   * ID generation is centralised.
   */
  static createTextBlock(data?: Text, children?: ReadonlyArray<Block<unknown>>): TextBlock {
    return new TextBlock(
      crypto.randomUUID(),
      data ?? new Text('', []),
      children ?? [],
    )
}

  get blocks(): ReadonlyArray<TextBlock | OrderedListBlock> {
    return flatToDto(this.#blocks)
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Returns the Block DTO (with full subtree) for the given id.
   * @throws {Error} if no block with `id` exists.
   */
  getBlock(id: BlockId): TextBlock | OrderedListBlock {
    function search(blocks: ReadonlyArray<TextBlock | OrderedListBlock>): TextBlock | OrderedListBlock | undefined {
      for (const b of blocks) {
        if (b.id === id) return b
        const found = search(b.children as ReadonlyArray<TextBlock | OrderedListBlock>)
        if (found) return found
      }
    }
    const result = search(flatToDto(this.#blocks))
    if (!result) throw new Error(`Block not found: ${id}`)
    return result
  }

  /**
   * Returns the ID immediately before `id` in pre-order flat sequence, or null if first.
   * @throws {Error} if no block with `id` exists.
   */
  previousBlockId(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    return idx === 0 ? null : this.#blocks[idx - 1].id
  }

  /**
   * Returns the ID immediately after `id` in pre-order flat sequence, or null if last.
   * @throws {Error} if no block with `id` exists.
   */
  nextBlockId(id: BlockId): BlockId | null {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    return idx === this.#blocks.length - 1 ? null : this.#blocks[idx + 1].id
  }

  /**
   * Returns the first block after the entire subtree of `id` whose indent ≤ indent(id).
   * i.e. the next sibling, or parent's next sibling, etc. Returns null if none exists.
   * @throws {Error} if no block with `id` exists.
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

  /**
   * Returns true if the block immediately after `id` in flat order has indent > indent(id).
   * @throws {Error} if no block with `id` exists.
   */
  hasChildren(id: BlockId): boolean {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`Block not found: ${id}`)
    return idx + 1 < this.#blocks.length && this.#blocks[idx + 1].indent > this.#blocks[idx].indent
  }

  /**
   * Returns the parent block's ID, or null if the block is at the root level.
   * @throws {Error} if no block with `id` exists.
   */
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

  /**
   * Returns the previous sibling's ID, or null if this is the first child.
   * @throws {Error} if no block with `id` exists.
   */
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

  /**
   * Returns the next sibling's ID, or null if this is the last child.
   * @throws {Error} if no block with `id` exists.
   */
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
    const oldTypeMap = new Map(oldBlocks.#blocks.map(b => [b.id, b.blockType]))

    for (const b of oldBlocks.#blocks) {
      if (!newIds.has(b.id)) {
        changes.push(new BlockRemoved(b.id))
      }
    }

    for (const b of newBlocks.#blocks) {
      if (!oldIds.has(b.id)) {
        // New block — report as added
        const newPrev = newBlocks.prevSibling(b.id)
        const newParent = newBlocks.parent(b.id)
        changes.push(new BlockAdded(
          b.id,
          b.data,
          newPrev,
          newParent,
        ))
        continue
      }

      const oldParent = oldBlocks.parent(b.id)
      const newParent = newBlocks.parent(b.id)
      const oldPrev = oldBlocks.prevSibling(b.id)
      const newPrev = newBlocks.prevSibling(b.id)
      if (oldParent !== newParent || oldPrev !== newPrev) {
        changes.push(new BlockMoved(b.id, newPrev, newParent))
      }

      const oldData = oldDataMap.get(b.id)!
      const oldType = oldTypeMap.get(b.id)!
      if (!oldData.equals(b.data) || oldType !== b.blockType) {
        changes.push(new BlockDataChanged(b.id, b.data, b.blockType))
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
    const target = this.#blocks[idx]
    const newBlock = new FlatBlock(block.id, block.data, target.indent, target.blockType)
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
    const target = this.#blocks[idx]
    const newBlock = new FlatBlock(block.id, block.data, target.indent, target.blockType)
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
    const target = this.#blocks[idx]
    const targetIndent = target.indent
    let insertAt = idx + 1
    while (insertAt < this.#blocks.length && this.#blocks[insertAt].indent > targetIndent) {
      insertAt++
    }
    const newBlock = new FlatBlock(block.id, block.data, targetIndent + 1, target.blockType)
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
    const target = this.#blocks[idx]
    const newBlock = new FlatBlock(block.id, block.data, target.indent + 1, target.blockType)
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
    const block = this.#blocks[idx]
    const updated = [...this.#blocks]
    updated[idx] = new FlatBlock(id, data, block.indent, block.blockType)
    return new Blocks(updated)
  }

  /**
   * Returns a new `Blocks` where every block in the pre-order range [`from`, `to`]
   * has its `blockType` set to `newType`.
   * @throws {Error} if `from` or `to` are not found, or `to` precedes `from`.
   */
  convertType(from: BlockId, to: BlockId, newType: BlockTypes): Blocks {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    const rangeIds = new Set(this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id))
    const updated = this.#blocks.map(b =>
      rangeIds.has(b.id) && b.blockType !== newType
        ? new FlatBlock(b.id, b.data, b.indent, newType)
        : b
    )
    return new Blocks(updated)
  }

  /**
   * Returns true when every block in the pre-order range [`from`, `to`] is `type`.
   * @throws {Error} if `from` or `to` are not found, or `to` precedes `from`.
   */
  isBlockTypeActive(from: BlockId, to: BlockId, type: BlockTypes): boolean {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    for (let i = fromIdx; i <= toIdx; i++) {
      if (this.#blocks[i].blockType !== type) return false
    }
    return true
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
        updated[i] = new FlatBlock(updated[i].id, updated[i].data, updated[i].indent + 1, updated[i].blockType)
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

    const preClamped = decremented.map(({ block, indent }) => new FlatBlock(block.id, block.data, indent, block.blockType))
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
      new FlatBlock(id, leftText, block.indent, block.blockType),
      new FlatBlock(newId, rightText, block.indent, block.blockType),
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
      new FlatBlock(left, mergedData, leftBlock.indent, leftBlock.blockType),
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
      updated[startIdx] = new FlatBlock(start.blockId, newText, startBlock.indent, startBlock.blockType)
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
      new FlatBlock(start.blockId, mergedText, startBlock.indent, startBlock.blockType),
      ...this.#blocks.slice(endSubtreeEnd),
    ]

    return new Blocks(clampPass(newBlocks))
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  // ─── Static helpers ───────────────────────────────────────────────────────────

  /**
   * Replays a sequence of `BlocksChange` events onto `base`, returning the
   * resulting `Blocks` state. Used by `BlockHistory` to reconstruct states
   * without storing snapshots.
   */
  static fromEvents(base: Blocks, changes: readonly BlocksChange[]): Blocks {
    let state = base
    for (const change of changes) {
      if (change instanceof BlockDataChanged) {
        state = state.update(change.id, change.data)
        state = state.convertType(change.id, change.id, change.blockType)
      } else if (change instanceof BlockAdded) {
        const data = change.data
        if (change.previousBlockId !== null) {
          state = state.addAfter(change.previousBlockId, { id: change.id, data })
        } else if (change.parentBlockId !== null) {
          state = state.prependChild(change.parentBlockId, { id: change.id, data })
        } else {
          state = state.addBefore(state.#blocks[0].id, { id: change.id, data })
        }
      } else if (change instanceof BlockRemoved) {
        state = state.delete(change.id)
      } else if (change instanceof BlockMoved) {
        const idx = state.#blocks.findIndex(b => b.id === change.id)
        if (idx === -1) throw new Error(`Block not found: ${change.id}`)
        let targetIndent = 0
        if (change.parentBlockId !== null) {
          const parentFlat = state.#blocks.find(b => b.id === change.parentBlockId)
          if (!parentFlat) throw new Error(`Parent block not found: ${change.parentBlockId}`)
          targetIndent = parentFlat.indent + 1
        }
        const updated = [...state.#blocks]
        updated[idx] = new FlatBlock(updated[idx].id, updated[idx].data, targetIndent, updated[idx].blockType)
        state = new Blocks(clampPass(updated))
      } else {
        const _exhaustive: never = change
        throw new Error(`Unhandled change type: ${JSON.stringify(_exhaustive)}`)
      }
    }
    return state
  }
}
