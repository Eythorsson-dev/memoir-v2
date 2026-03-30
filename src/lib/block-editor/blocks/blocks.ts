import { Text, type TextDto, type InlineTypes, type InlineDtoMap, type InlineDto, inlinePayloadEqual } from '../text/text'

type NeverPayloadTypes = { [K in InlineTypes]: InlineDtoMap[K] extends never ? K : never }[InlineTypes]
type DataPayloadTypes = Exclude<InlineTypes, NeverPayloadTypes>

const EXCLUSIVE_INLINE_TYPES = new Set<InlineTypes>(['Highlight'])

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

  equals(other: Block<unknown>): boolean {
    return other instanceof TextBlock && this.data.equals(other.data)
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

  equals(other: Block<unknown>): boolean {
    return other instanceof OrderedListBlock && this.data.equals(other.data)
  }
}

/** The level of a heading — 1 (largest) to 3 (smallest). */
export type HeaderLevel = 1 | 2 | 3

/**
 * Value object holding the data for a header block.
 *
 * @throws {Error} if `level` is not 1, 2, or 3.
 */
export class Header {
  readonly level: HeaderLevel
  readonly text: Text

  constructor(level: HeaderLevel, text: Text) {
    if (level !== 1 && level !== 2 && level !== 3) {
      throw new Error(`Header level must be 1, 2, or 3 — got ${level}`)
    }
    this.level = level
    this.text = text
    Object.freeze(this)
  }

  equals(other: unknown): boolean {
    return other instanceof Header && this.level === other.level && this.text.equals(other.text)
  }
}

/** A heading block with a level (1–3). */
export class HeaderBlock extends Block<Header> {
  get blockType() { return 'header' as const }

  constructor(
    id: BlockId,
    data: Header,
    children: ReadonlyArray<Block<unknown>>,
  ) {
    super(id, data, children)
  }

  getLength(): number {
    return this.data.text.text.length
  }

  getText(): Text {
    return this.data.text
  }

  equals(other: Block<unknown>): boolean {
    return other instanceof HeaderBlock && this.data.equals(other.data)
  }
}

/** An unordered-list item block. */
export class UnorderedListBlock extends Block<Text> {
  get blockType() { return 'unordered-list' as const }

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

  equals(other: Block<unknown>): boolean {
    return other instanceof UnorderedListBlock && this.data.equals(other.data)
  }
}

// Derived from the concrete block classes — add new classes to this union
// and BlockTypes updates automatically.
export type AnyBlock = TextBlock | OrderedListBlock | UnorderedListBlock | HeaderBlock

/** Union of all valid block type names, derived from concrete block class declarations. */
export type BlockTypes = AnyBlock['blockType']

export interface BlockTypeMap {
  'text': Text
  'ordered-list': Text
  'unordered-list': Text
  'header': Header
}

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

export class BlockAdded<T extends BlockTypes = BlockTypes> {
  constructor(
    readonly id: BlockId,
    readonly blockType: T,
    readonly data: BlockTypeMap[T],
    readonly previousBlockId: BlockId | null,
    readonly parentBlockId: BlockId | null,
  ) { Object.freeze(this) }
}

export class BlockDataChanged<T extends BlockTypes = BlockTypes> {
  constructor(
    readonly id: BlockId,
    readonly blockType: T,
    readonly data: BlockTypeMap[T],
  ) { Object.freeze(this) }
}

export type BlocksChange = BlockMoved | BlockRemoved | BlockAdded | BlockDataChanged

// ─── Internal types ────────────────────────────────────────────────────────────

/**
 * Internal flat representation used within blocks.ts.
 * Generic over `T` so `blockType` and `data` are correlated via `BlockTypeMap`.
 * Not exported — external code uses the concrete block classes.
 */
class FlatBlock<T extends BlockTypes = BlockTypes> {
  constructor(
    readonly id: BlockId,
    readonly blockType: T,
    readonly data: BlockTypeMap[T],
    readonly indent: number,
  ) {
    Object.freeze(this)
  }

  /** Returns the text content regardless of block type. */
  getText(): Text {
    return this.data instanceof Header ? this.data.text : this.data as Text
  }

  /** Returns a new FlatBlock with `text` as content, preserving the header level if applicable. */
  withText(text: Text): FlatBlock<T> {
    const newData: BlockTypeMap[T] = this.blockType === 'header'
      ? new Header((this.data as Header).level, text) as BlockTypeMap[T]
      : text as BlockTypeMap[T]
    return new FlatBlock(this.id, this.blockType, newData, this.indent)
  }

  /** Returns a new FlatBlock with `indent` replaced. */
  withIndent(indent: number): FlatBlock<T> {
    return new FlatBlock(this.id, this.blockType, this.data, indent)
  }
}

/**
 * Accepted by `addBefore`, `addAfter`, `appendChild`, and `prependChild`.
 * When `blockType` is omitted the type is inherited from the neighbour
 * (falling back to `'text'` for headers).
 */
type NewBlock<T extends BlockTypes = BlockTypes> =
  | { id: BlockId; data: Text }
  | { id: BlockId; blockType: T; data: BlockTypeMap[T] }

/**
 * Resolves a `NewBlock` to a concrete `[blockType, data]` pair.
 * If the caller specified a `blockType`, use it as-is.
 * Otherwise inherit from `target`, falling back to `'text'` for headers.
 */
function resolveNewBlock<T extends BlockTypes>(
  block: NewBlock<T>,
  target: FlatBlock,
): [BlockTypes, BlockTypeMap[BlockTypes]] {
  if ('blockType' in block) return [block.blockType, block.data]
  const inherited: Exclude<BlockTypes, 'header'> = target.blockType === 'header' ? 'text' : target.blockType
  return [inherited, block.data]
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
      clamped.push(block.withIndent(0))
    } else {
      clamped.push(block.withIndent(Math.min(block.indent, clamped[i - 1].indent + 1)))
    }
  }
  return clamped
}

// ─── Block (tree DTO) → FlatBlock conversion ──────────────────────────────────

/**
 * Ensures `raw` is a proper `Text` instance.
 * When blocks are deserialised from JSON (e.g. `localStorage`), `data` arrives
 * as a plain object that lacks the `Text` prototype methods. This reviver
 * reconstructs the instance so that methods like `split` are available.
 */
function reviveText(raw: unknown): Text {
  if (raw instanceof Text) return raw
  const { text, inline } = raw as TextDto
  return new Text(text, inline as InlineDto[])
}

/**
 * Ensures block data is a proper class instance.
 * Handles both live instances (no-op) and plain JSON-deserialised objects.
 */
function reviveData<T extends BlockTypes>(blockType: T, raw: unknown): BlockTypeMap[T] {
  if (blockType === 'header') {
    if (raw instanceof Header) return raw as BlockTypeMap[T]
    const { level, text } = raw as { level: HeaderLevel; text: unknown }
    return new Header(level, reviveText(text)) as BlockTypeMap[T]
  }
  return reviveText(raw) as BlockTypeMap[T]
}

function dtoToFlat(dtos: ReadonlyArray<AnyBlock>, depth = 0, result: FlatBlock[] = []): FlatBlock[] {
  for (const block of dtos) {
    result.push(new FlatBlock(block.id, block.blockType, reviveData(block.blockType, block.data), depth))
    dtoToFlat(block.children as ReadonlyArray<AnyBlock>, depth + 1, result)
  }
  return result
}

// ─── FlatBlock → Block (tree DTO) conversion ──────────────────────────────────

function flatToDto(blocks: ReadonlyArray<FlatBlock>): ReadonlyArray<AnyBlock> {
  type MutableBlock = { id: BlockId; blockType: BlockTypes; data: BlockTypeMap[BlockTypes]; children: MutableBlock[] }

  const roots: MutableBlock[] = []
  const stack: Array<{ node: MutableBlock; indent: number }> = []

  for (const block of blocks) {
    const node: MutableBlock = { id: block.id, blockType: block.blockType, data: block.data, children: [] }
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

  function buildBlock(node: MutableBlock): AnyBlock {
    const children = node.children.map(buildBlock)
    switch (node.blockType) {
      case 'text':        return new TextBlock(node.id, node.data as Text, children)
      case 'ordered-list':   return new OrderedListBlock(node.id, node.data as Text, children)
      case 'unordered-list': return new UnorderedListBlock(node.id, node.data as Text, children)
      case 'header':         return new HeaderBlock(node.id, node.data as Header, children)
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

  get blocks(): ReadonlyArray<AnyBlock> {
    return flatToDto(this.#blocks)
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Returns the Block DTO (with full subtree) for the given id.
   * @throws {Error} if no block with `id` exists.
   */
  getBlock(id: BlockId): AnyBlock {
    function search(blocks: ReadonlyArray<AnyBlock>): AnyBlock | undefined {
      for (const b of blocks) {
        if (b.id === id) return b
        const found = search(b.children as ReadonlyArray<AnyBlock>)
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
        changes.push(new BlockAdded(b.id, b.blockType, b.data, newPrev, newParent))
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
      const dataChanged = !oldData.equals(b.data)

      if (dataChanged || oldType !== b.blockType) {
        if (b.blockType === 'header') {
          changes.push(new BlockDataChanged(b.id, 'header', b.data as Header))
        } else {
          changes.push(new BlockDataChanged(b.id, b.blockType, b.data as Text))
        }
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
  addBefore<T extends BlockTypes>(id: BlockId, block: NewBlock<T>): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const target = this.#blocks[idx]
    const [blockType, data] = resolveNewBlock(block, target)
    const newBlock = new FlatBlock(block.id, blockType, data, target.indent)
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
  addAfter<T extends BlockTypes>(id: BlockId, block: NewBlock<T>): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const target = this.#blocks[idx]
    const [blockType, data] = resolveNewBlock(block, target)
    const newBlock = new FlatBlock(block.id, blockType, data, target.indent)
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
  appendChild<T extends BlockTypes>(id: BlockId, block: NewBlock<T>): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const target = this.#blocks[idx]
    const targetIndent = target.indent
    let insertAt = idx + 1
    while (insertAt < this.#blocks.length && this.#blocks[insertAt].indent > targetIndent) {
      insertAt++
    }
    const [blockType, data] = resolveNewBlock(block, target)
    const newBlock = new FlatBlock(block.id, blockType, data, targetIndent + 1)
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
  prependChild<T extends BlockTypes>(id: BlockId, block: NewBlock<T>): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const target = this.#blocks[idx]
    const [blockType, data] = resolveNewBlock(block, target)
    const newBlock = new FlatBlock(block.id, blockType, data, target.indent + 1)
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
    updated[idx] = this.#blocks[idx].withText(data)
    return new Blocks(updated)
  }

  /**
   * Returns a new `Blocks` where every block in the pre-order range [`from`, `to`]
   * has its `blockType` set to `newType`.
   * @throws {Error} if `from` or `to` are not found, or `to` precedes `from`.
   */
  convertType(from: BlockId, to: BlockId, newType: Exclude<BlockTypes, 'header'>): Blocks {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    const rangeIds = new Set(this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id))
    const updated = this.#blocks.map(b =>
      rangeIds.has(b.id) && b.blockType !== newType
        ? new FlatBlock(b.id, newType, b.getText(), b.indent)
        : b
    )
    return new Blocks(updated)
  }

  /**
   * Returns a new `Blocks` where every block in the pre-order range [`from`, `to`]
   * is converted to a header at the given `level`.
   * @throws {Error} if `from` or `to` are not found, or `to` precedes `from`.
   */
  convertToHeader(from: BlockId, to: BlockId, level: HeaderLevel): Blocks {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    const rangeIds = new Set(this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id))
    const updated = this.#blocks.map(b =>
      rangeIds.has(b.id)
        ? new FlatBlock(b.id, 'header', new Header(level, b.getText()), b.indent)
        : b
    )
    return new Blocks(updated)
  }

  /**
   * Returns the header level of the block with `id`, or `null` if it is not a header.
   * @throws {Error} if no block with `id` exists.
   */
  getHeaderLevel(id: BlockId): HeaderLevel | null {
    const block = this.#blocks.find(b => b.id === id)
    if (!block) throw new Error(`No block with id '${id}' found`)
    return block.blockType === 'header' ? (block.data as Header).level : null
  }

  /**
   * Returns the common header level across the range [`from`, `to`], or `null`
   * if any block is not a header or the levels are mixed.
   * @throws {Error} if `from` or `to` are not found, or `to` precedes `from`.
   */
  getCommonHeaderLevel(from: BlockId, to: BlockId): HeaderLevel | null {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    let common: HeaderLevel | null = null
    for (let i = fromIdx; i <= toIdx; i++) {
      const b = this.#blocks[i]
      if (b.blockType !== 'header') return null
      const level = (b.data as Header).level
      if (common === null) common = level
      else if (common !== level) return null
    }
    return common
  }

  #blockIdsInRange(from: BlockId, to: BlockId): BlockId[] {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    return this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id)
  }

  toggleInline(range: BlockRange, type: NeverPayloadTypes): Blocks
  toggleInline<K extends DataPayloadTypes>(range: BlockRange, type: K, payload: InlineDtoMap[K]): Blocks
  toggleInline(range: BlockRange, type: InlineTypes, payload?: InlineDtoMap[DataPayloadTypes]): Blocks {
    const blockIds = this.#blockIdsInRange(range.start.blockId, range.end.blockId)
    const allToggled = blockIds.every((blockId, idx) => {
      const text = this.getBlock(blockId).getText()
      const segStart = idx === 0 ? range.start.offset : 0
      const segEnd = idx === blockIds.length - 1 ? range.end.offset : text.text.length
      if (segStart >= segEnd) return true
      const dto = { type, start: segStart, end: segEnd, ...payload } as InlineDto
      return text.isToggled(dto)
    })
    let result: Blocks = this
    for (let idx = 0; idx < blockIds.length; idx++) {
      const blockId = blockIds[idx]
      const text = result.getBlock(blockId).getText()
      const segStart = idx === 0 ? range.start.offset : 0
      const segEnd = idx === blockIds.length - 1 ? range.end.offset : text.text.length
      if (segStart >= segEnd) continue
      const dto = { type, start: segStart, end: segEnd, ...payload } as InlineDto
      let newText: Text
      if (allToggled) {
        newText = text.removeInline(type, segStart, segEnd)
      } else if (EXCLUSIVE_INLINE_TYPES.has(type)) {
        newText = text.removeInline(type, segStart, segEnd).addInline(dto)
      } else {
        newText = text.addInline(dto)
      }
      result = result.update(blockId, newText)
    }
    return result
  }

  getActiveInline<K extends InlineTypes>(range: BlockRange, type: K): InlineDto<K> | null {
    const blockIds = this.#blockIdsInRange(range.start.blockId, range.end.blockId)
    let active: InlineDto<K> | null = null
    for (let idx = 0; idx < blockIds.length; idx++) {
      const text = this.getBlock(blockIds[idx]).getText()
      const segStart = idx === 0 ? range.start.offset : 0
      const segEnd = idx === blockIds.length - 1 ? range.end.offset : text.text.length
      if (segStart >= segEnd) continue
      if (segEnd > text.text.length) return null
      const covering = (text.inline as InlineDto<K>[]).filter(
        (i) => i.type === type && i.start <= segStart && i.end >= segEnd
      )
      if (covering.length !== 1) return null
      const candidate = covering[0]
      if (active === null) {
        active = candidate
      } else if (!inlinePayloadEqual(active, candidate)) {
        return null
      }
    }
    return active
  }

  isInlineActive(range: BlockRange, type: InlineTypes): boolean {
    const blockIds = this.#blockIdsInRange(range.start.blockId, range.end.blockId)
    for (let idx = 0; idx < blockIds.length; idx++) {
      const text = this.getBlock(blockIds[idx]).getText()
      const segStart = idx === 0 ? range.start.offset : 0
      const segEnd = idx === blockIds.length - 1 ? range.end.offset : text.text.length
      if (segStart >= segEnd) continue
      if (segEnd > text.text.length) return false
      if (!text.isCoveredByType(type, segStart, segEnd)) return false
    }
    return true
  }

  removeInlineFromRange(range: BlockRange, type: InlineTypes): Blocks {
    const blockIds = this.#blockIdsInRange(range.start.blockId, range.end.blockId)
    let result: Blocks = this
    for (let idx = 0; idx < blockIds.length; idx++) {
      const blockId = blockIds[idx]
      const text = result.getBlock(blockId).getText()
      const segStart = idx === 0 ? range.start.offset : 0
      const segEnd = idx === blockIds.length - 1 ? range.end.offset : text.text.length
      if (segStart >= segEnd) continue
      result = result.update(blockId, text.removeInline(type, segStart, segEnd))
    }
    return result
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
        updated[i] = updated[i].withIndent(updated[i].indent + 1)
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

    const preClamped = decremented.map(({ block, indent }) => block.withIndent(indent))
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
    const blockText = block.getText()
    if (offset < 0 || offset > blockText.text.length) {
      throw new RangeError(`offset ${offset} out of bounds for block '${id}'`)
    }
    const [leftText, rightText] = blockText.split(offset)
    return new Blocks([
      ...this.#blocks.slice(0, idx),
      block.withText(leftText),
      new FlatBlock(newId, block.blockType, block.withText(rightText).data, block.indent),
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
    const mergedText = Text.merge(leftBlock.getText(), rightBlock.getText())
    const updated = [
      ...this.#blocks.slice(0, leftIdx),
      leftBlock.withText(mergedText),
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
      const updated = [...this.#blocks]
      updated[startIdx] = startBlock.withText(startBlock.getText().remove(start.offset, length))
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

    const [leftText] = startBlock.getText().split(start.offset)
    const [, rightText] = endBlock.getText().split(end.offset)
    const mergedText = Text.merge(leftText, rightText)

    const newBlocks = [
      ...this.#blocks.slice(0, startIdx),
      startBlock.withText(mergedText),
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
        if (change.blockType === 'header') {
          const data = change.data as Header
          state = state.update(change.id, data.text)
          state = state.convertToHeader(change.id, change.id, data.level)
        } else {
          state = state.update(change.id, change.data as Text)
          state = state.convertType(change.id, change.id, change.blockType)
        }
      } else if (change instanceof BlockAdded) {
        const newBlock = { id: change.id, blockType: change.blockType, data: change.data }
        if (change.previousBlockId !== null) {
          state = state.addAfter(change.previousBlockId, newBlock)
        } else if (change.parentBlockId !== null) {
          state = state.prependChild(change.parentBlockId, newBlock)
        } else {
          state = state.addBefore(state.#blocks[0].id, newBlock)
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
        updated[idx] = updated[idx].withIndent(targetIndent)
        state = new Blocks(clampPass(updated))
      } else {
        const _exhaustive: never = change
        throw new Error(`Unhandled change type: ${JSON.stringify(_exhaustive)}`)
      }
    }
    return state
  }
}
