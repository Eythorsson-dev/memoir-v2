import { Text, TextDto, InlineDto } from '../text/text'

export type BlockId = string

export type BlockDto = {
  id: BlockId
  data: TextDto
  children: ReadonlyArray<BlockDto>
}

// ─── Internal types ────────────────────────────────────────────────────────────

class Block {
  constructor(
    readonly id: BlockId,
    readonly data: Text,
    readonly indent: number
  ) {}
}

type MutableBlockDto = { id: BlockId; data: TextDto; children: MutableBlockDto[] }

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(blocks: ReadonlyArray<Block>): void {
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

// ─── DTO → Flat conversion ─────────────────────────────────────────────────────

function dtoToFlat(dtos: ReadonlyArray<BlockDto>, depth = 0, result: Block[] = []): Block[] {
  for (const dto of dtos) {
    result.push(new Block(dto.id, new Text(dto.data.text, [...dto.data.inline] as InlineDto[]), depth))
    dtoToFlat(dto.children, depth + 1, result)
  }
  return result
}

// ─── Flat → DTO conversion ─────────────────────────────────────────────────────

function flatToDto(blocks: ReadonlyArray<Block>): ReadonlyArray<BlockDto> {
  const roots: MutableBlockDto[] = []
  const stack: Array<{ node: MutableBlockDto; indent: number }> = []

  for (const block of blocks) {
    const node: MutableBlockDto = {
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

  return roots as ReadonlyArray<BlockDto>
}

// ─── Range helper ──────────────────────────────────────────────────────────────

function getRange(blocks: ReadonlyArray<Block>, fromId: BlockId, toId: BlockId): [number, number] {
  const fromIdx = blocks.findIndex(b => b.id === fromId)
  const toIdx = blocks.findIndex(b => b.id === toId)
  if (fromIdx === -1) throw new Error(`Block '${fromId}' not found`)
  if (toIdx === -1) throw new Error(`Block '${toId}' not found`)
  if (toIdx < fromIdx) throw new Error(`'${toId}' appears before '${fromId}' in document order`)
  return [fromIdx, toIdx]
}

// ─── Blocks class ─────────────────────────────────────────────────────────────

export class Blocks {
  #blocks: ReadonlyArray<Block>

  private constructor(blocks: ReadonlyArray<Block>) {
    validate(blocks)
    this.#blocks = blocks
  }

  static from(dtos: ReadonlyArray<BlockDto>): Blocks {
    return new Blocks(dtoToFlat(dtos))
  }

  get blocks(): ReadonlyArray<BlockDto> {
    return flatToDto(this.#blocks)
  }

  /**
   * Returns a new `Blocks` with a block inserted immediately before the block
   * identified by `id`, at the same indent level.
   * @throws if no block with `id` exists.
   * @throws if `block.id` already exists (via constructor).
   */
  addBefore(id: BlockId, block: { id: BlockId; data: Text }): Blocks {
    const idx = this.#blocks.findIndex(b => b.id === id)
    if (idx === -1) throw new Error(`No block with id '${id}' found`)
    const newBlock = new Block(block.id, block.data, this.#blocks[idx].indent)
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
    const newBlock = new Block(block.id, block.data, this.#blocks[idx].indent)
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
    const newBlock = new Block(block.id, block.data, targetIndent + 1)
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
    const newBlock = new Block(block.id, block.data, this.#blocks[idx].indent + 1)
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
    updated[idx] = new Block(id, data, this.#blocks[idx].indent)
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
   * has its indent incremented by 1, subject to the evolving-state rule:
   * a block is incremented only if its current indent ≤ the (already-updated)
   * indent of the block immediately before it. Blocks with no predecessor are
   * silently skipped.
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
        updated[i] = new Block(updated[i].id, updated[i].data, updated[i].indent + 1)
      }
    }

    return new Blocks(updated)
  }

  /**
   * Returns a new `Blocks` where each block in the pre-order range [`from`, `to`]
   * has its indent decremented by 1 (blocks at indent 0 are silently skipped),
   * followed by a clamping pass over the entire list to restore max-step validity.
   * @throws if `from` or `to` are not found, or `to` precedes `from`.
   */
  unindent(from: BlockId, to: BlockId): Blocks {
    const [fromIdx, toIdx] = getRange(this.#blocks, from, to)
    const rangeIds = new Set(this.#blocks.slice(fromIdx, toIdx + 1).map(b => b.id))

    // Step 1: decrement range blocks (skip those already at 0)
    const decremented = this.#blocks.map(block => ({
      block,
      indent: rangeIds.has(block.id) ? Math.max(0, block.indent - 1) : block.indent,
    }))

    // Step 2: clamp pass — restore max-step validity across the entire list
    const clamped: Block[] = []
    for (let i = 0; i < decremented.length; i++) {
      const { block } = decremented[i]
      if (i === 0) {
        clamped.push(new Block(block.id, block.data, 0))
      } else {
        const maxAllowed = clamped[i - 1].indent + 1
        const newIndent = Math.min(decremented[i].indent, maxAllowed)
        clamped.push(new Block(block.id, block.data, newIndent))
      }
    }

    return new Blocks(clamped)
  }
}
