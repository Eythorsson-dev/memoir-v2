# Blocks V2 — Flat List with Indent

## Overview

Redesign the `Blocks` domain model to use a **flat list with numeric `indent` fields** as the internal representation, replacing the recursive `children` tree. The external DTO format (`BlockDto` with `children`) is the public interface for all callers. `Block` (flat, with `indent`) is an internal implementation detail, not exported from the module.

## Key Design Decisions

### Internal: `Block` class (not exported)

`Block` is internal to `blocks.ts` only. It uses `indent: number` instead of `children`. The internal flat list is stored on `Blocks` as the private field `#blocks`:

```ts
class Block {
  constructor(
    readonly id: BlockId,
    readonly data: Text,
    readonly indent: number
  ) {}
}

class Blocks {
  #blocks: ReadonlyArray<Block>  // internal flat list — never exposed directly
  // ...
}
```

### Public interface: `BlockDto` (unchanged)

```ts
type BlockDto = {
  id: BlockId
  data: TextDto
  children: ReadonlyArray<BlockDto>
}
```

All callers — including the serializer, tests, and library consumers — use `BlockDto` exclusively. `Block` is never part of any public signature. Mutating methods accept `Text` (not `TextDto`) for block data — callers are responsible for constructing the `Text` instance.

### `Blocks` Constructor

**Private.** Accepts the internal `ReadonlyArray<Block>` (flat), stores it in the private field `#blocks`, and validates all rules. Throws on any violation. External callers must use `Blocks.from` — the constructor is not accessible outside `blocks.ts`.

```ts
class Blocks {
  #blocks: ReadonlyArray<Block>
  private constructor(blocks: ReadonlyArray<Block>)
  public get blocks(): ReadonlyArray<BlockDto>  // converts flat → tree on read
}
```

### `Blocks.from` (static factory — primary public entry point)

Accepts `ReadonlyArray<BlockDto>` (tree format). Converts to flat `Block[]` internally, then calls the constructor. The constructor catches any structural violations (e.g. empty list, duplicate IDs).

```ts
static from(blocks: ReadonlyArray<BlockDto>): Blocks
```

### `.blocks` getter

Returns `ReadonlyArray<BlockDto>` — the tree representation. Converts the internal flat list back to a tree on each call.

## Validation Rules (enforced in constructor, throw on violation)

Mutation methods may rely on the constructor to enforce all structural invariants — they do not need to duplicate checks already performed by the constructor. The "Throws if..." notes on methods describe the *observable behavior*, not where the check must be implemented.

### Block-level
- **Non-empty list**: `blocks.length >= 1` — the list must contain at least one block.
- **Non-empty ID**: every `Block.id` must be a non-empty string (length ≥ 1).
- **Unique IDs**: all `id` values across the flat list must be distinct.

### Indent rules
1. **Whole number**: `indent` must be a non-negative integer (no decimals, no negatives).
2. **Root block**: `blocks[0].indent === 0`.
3. **Max step**: `blocks[i].indent <= blocks[i-1].indent + 1` — a block may only be indented one level deeper than the previous block.

The following state is illegal and must be rejected by the constructor:
```
[{ id: A, indent: 0 }, { id: B, indent: 2 }]
//  B's indent (2) > A's indent (0) + 1 — violates max-step rule
```

## DTO → Flat Conversion (`Blocks.from`)

Pre-order depth-first traversal assigns `indent` based on depth:

```
Input (BlockDto[]):
  A (children: [B (children: [C])])
  D

Internal flat (Block[]):
  Block('A', data, 0)
  Block('B', data, 1)
  Block('C', data, 2)
  Block('D', data, 0)
```

`TextDto` is converted to `Text` during this conversion: `new Text(dto.data.text, [...dto.data.inline])`. Verify the `Text` constructor signature in `src/text/text.ts` before writing this conversion and use whatever the constructor actually expects.

## Flat → DTO Conversion (`.blocks` getter)

Since `BlockDto.children` is `ReadonlyArray<BlockDto>`, a private mutable intermediate type is used during construction:

```ts
type MutableBlockDto = { id: BlockId; data: TextDto; children: MutableBlockDto[] }
```

Build the tree using `MutableBlockDto`, then return it cast as `ReadonlyArray<BlockDto>` (shapes are identical).

Walk the flat list using a stack that tracks both the `MutableBlockDto` node and its indent level. For each block, pop entries from the stack while the top's indent is `>=` the current block's indent, then append the current block as a child of the stack top (or to the root array if the stack is empty). Push the current block (with its indent) onto the stack.

Pseudocode:

```
const roots: MutableBlockDto[] = []
const stack: Array<{ node: MutableBlockDto; indent: number }> = []

for each block in #blocks:
    const node: MutableBlockDto = { id: block.id, data: toTextDto(block.data), children: [] }
    while stack.length > 0 && stack[stack.length - 1].indent >= block.indent:
        stack.pop()
    if stack.length === 0:
        roots.push(node)
    else:
        stack[stack.length - 1].node.children.push(node)
    stack.push({ node, indent: block.indent })

return roots as ReadonlyArray<BlockDto>
```

Note: `MutableBlockDto` has no `indent` field, so the stack stores indent separately in a wrapper object.

Examples:

```
Flat input:                          Tree output:
  A indent=0                           A
  B indent=1                             B
  C indent=2                               C
  D indent=0                           D
```

```
Flat input:                          Tree output:
  A indent=0                           A
  B indent=1                             B
  C indent=1                             C
  D indent=0                           D
  E indent=0                           E
```

Note how going from `C` (indent=1) to `D` (indent=0) pops multiple levels off the stack — the algorithm must handle arbitrary level jumps upward.

## Methods

### `addBefore(id: BlockId, block: { id: BlockId, data: Text }): Blocks`

Inserts a new block immediately before the block with the given `id`. The new block's `indent` equals the target block's `indent`.

- Throws if `id` not found.
- Throws if `block.id` already exists.

### `addAfter(id: BlockId, block: { id: BlockId, data: Text }): Blocks`

Inserts a new block immediately after the block with the given `id`. The new block's `indent` equals the target block's `indent`.

- Throws if `id` not found.
- Throws if `block.id` already exists.

### `appendChild(id: BlockId, block: { id: BlockId, data: Text }): Blocks`

Inserts a new block as the last child of the block with the given `id`.

Internally: scan forward from the target to find the end of its subtree (all consecutive blocks with `indent > target.indent`). Insert the new block after the last such block (or immediately after the target if it has no children). The new block gets `indent = target.indent + 1`.

- Throws if `id` not found.
- Throws if `block.id` already exists.

### `prependChild(id: BlockId, block: { id: BlockId, data: Text }): Blocks`

Inserts a new block as the first child of the block with the given `id`. Internally: inserts the new block immediately after the target block with `indent = target.indent + 1`.

- Throws if `id` not found.
- Throws if `block.id` already exists.

### `update(id: BlockId, data: Text): Blocks`

Returns a new `Blocks` with the matching block's `data` replaced. `indent` is unchanged.

- Throws if `id` not found.

### `delete(id: BlockId): Blocks`

Removes a block from the flat list.

- A block has descendants if there is any following block with `indent > this block's indent` (before the next block at `indent <= this block's indent`). Throws in that case.
- Throws if `id` not found.
- Throws if deletion would empty the list.

### `indent(from: BlockId, to: BlockId): Blocks`

Increments `indent` by 1 for each block in the pre-order range `[from, to]`, **using the evolving state**: each block's indent is checked (and potentially updated) before moving to the next.

A block in the range is incremented only if `block.indent <= prevBlock.indent`, where `prevBlock` is the block immediately before it in `#blocks` (i.e. `#blocks[i-1]`), regardless of whether that block is inside or outside the range. The check uses the evolving state — if `prevBlock` was itself incremented earlier in this operation, its updated indent is used. If there is no previous block (the target is first in the list), it is silently skipped.

Pseudocode:

```
function indent(from, to) {
    const rangeIds = new Set(getBlocksInRange(from, to).map(x => x.id))
    const updated = [...#blocks]  // mutable working copy (same Block objects initially)

    for (let i = 0; i < updated.length; i++) {
        if (!rangeIds.has(updated[i].id)) continue
        if (i === 0) continue  // no previous block — silently skip
        const prevIndent = updated[i - 1].indent  // evolving state: use already-updated value
        if (updated[i].indent <= prevIndent) {
            updated[i] = new Block(updated[i].id, updated[i].data, updated[i].indent + 1)
        }
    }

    return new Blocks(updated)
}
```

Examples:

```
indent(B, C):
Before: [A:0, B:0, C:0, D:0]
- A not in range
- B: prev=A(0), B.indent(0) <= 0 → increment to 1
- C: prev=B(now 1), C.indent(0) <= 1 → increment to 1
- D not in range
After:  [A:0, B:1, C:1, D:0]
```

```
indent(A, C):
Before: [A:0, B:1, C:1, D:0]
- A: no previous block → skip
- B: prev=A(0), B.indent(1) <= 0? No → skip
- C: prev=B(still 1), C.indent(1) <= 1 → increment to 2
After:  [A:0, B:1, C:2, D:0]
```

```
indent(C, D):
Before: [A:0, B:1, C:1, D:0, E:0]
- C: prev=B(1), C.indent(1) <= 1 → increment to 2
- D: prev=C(now 2), D.indent(0) <= 2 → increment to 1
After:  [A:0, B:1, C:2, D:1, E:0]
```

- Throws if `from` or `to` not found, or `to` precedes `from`.
- `from === to` is valid (single-block range).

### `unindent(from: BlockId, to: BlockId): Blocks`

Decrements `indent` by 1 for all blocks in the pre-order range `[from, to]`. Blocks with `indent === 0` are silently skipped (their indent stays at 0).

After the range decrement, a single clamping pass is applied over **all** blocks in the list to restore max-step validity. This ensures that any block whose indent now exceeds `prevBlock.indent + 1` (because its parent was decremented) is also brought down. The clamp pass processes blocks in order, so it cascades automatically.

Pseudocode:

```
function unindent(from, to) {
    const blockIdsToUnindent = new Set(getBlocksInRange(from, to).map(x => x.id))

    // Step 1: decrement range blocks (skip those already at 0)
    const decremented = blocks.map(block => ({
        ...block,
        indent: blockIdsToUnindent.has(block.id)
            ? Math.max(0, block.indent - 1)
            : block.indent
    }))

    // Step 2: clamp pass — restore max-step validity across the entire list
    const clamped = []
    for (let i = 0; i < decremented.length; i++) {
        if (i === 0) {
            clamped.push({ ...decremented[i], indent: 0 })
        } else {
            const maxAllowed = clamped[i - 1].indent + 1
            clamped.push({ ...decremented[i], indent: Math.min(decremented[i].indent, maxAllowed) })
        }
    }

    return new Blocks(clamped)
}
```

Example:

```
unindent(A, B):
Before: [A:0, B:1, C:2, D:1, E:0]

Step 1 — decrement range [A, B]:
  A: indent 0, already 0, stays 0
  B: indent 1 → 0
  [A:0, B:0, C:2, D:1, E:0]

Step 2 — clamp pass:
  A: index 0, clamped to 0
  B: prev=A(0), max=1, B(0) <= 1 → stays 0
  C: prev=B(0), max=1, C(2) > 1 → clamped to 1
  D: prev=C(1), max=2, D(1) <= 2 → stays 1
  E: prev=D(1), max=2, E(0) <= 2 → stays 0

After: [A:0, B:0, C:1, D:1, E:0]
```

- Throws if `from` or `to` not found, or `to` precedes `from`.
- `from === to` is valid (single-block range).

## Serializer

The `blocksSerializer` uses `BlockDto` exclusively — it never interacts with the internal `Block` type.

- **Import change**: Remove `Block` from the import in `serializer.ts`. The import should only reference `Blocks`, `BlockId`, and `BlockDto`.
- **Render**: Calls `.blocks` to get `BlockDto[]` (tree format), then converts to nested DOM (same as before).
- **Parse**: Walks nested DOM recursively, tracking depth. Builds `BlockDto[]` and passes it to `Blocks.from`.

The DOM format is **unchanged**.

## File Changes

| File | Change |
|------|--------|
| `src/blocks/blocks.ts` | Rewrite: remove `export` from `Block`; `Block` (unexported, internal) gets `indent: number`; `Blocks` stores flat list as private `#blocks`; `Blocks` constructor is `private`; `Blocks.from` accepts `BlockDto[]`; `.blocks` getter replaces old public field and returns `BlockDto[]`; mutating methods that insert a new block accept `{ id: BlockId; data: Text }` (not a `Block` instance) |
| `src/blocks/blocks.test.ts` | Rewrite all tests: `Block` is no longer exported and the `Blocks` constructor is private, so `new Block(...)` and `new Blocks([...])` are unavailable — use `Blocks.from(dtos)` exclusively |
| `src/blocks/serializer.ts` | Remove `Block` from import (no longer exported); update `renderBlock` to accept `BlockDto`; update `parse` to build `BlockDto[]` and call `Blocks.from` instead of `new Blocks(blocks)` |
| `src/blocks/serializer.test.ts` | Update tests |

## Workflow

- Do not commit any changes. All changes must be reviewed by the user before committing.
- **TDD approach for this rewrite**: The existing tests will not compile once `Block` is removed from exports and the `Blocks` constructor is made private, so the standard red-green cycle cannot be followed from the start. Instead: implement the full class in step 1 (with its end-of-step typecheck gate), then write all tests in step 2. Within step 2, write and verify tests for each method group before moving to the next — do not write all tests at once and run them only at the end.

## Implementation Steps

1. Rewrite `blocks.ts`:
   a. Remove the `export` keyword from `class Block`. Change its shape from `(id, data, children)` to `(id, data: Text, indent: number)`. Remove all existing tree-based helper functions (`treeInsertBefore`, `treeIndentBlock`, etc.) and the `TraversalEntry`/`flatTraversal` helpers.
   b. Add a private validation helper that enforces all rules from the Validation Rules section (non-empty list, non-empty IDs, unique IDs, whole-number non-negative indents, first block indent=0, max-step rule).
   c. Add a private DTO→flat conversion helper used by `Blocks.from`: DFS traversal assigning indent by depth; converts `TextDto → Text` via `new Text(dto.data.text, [...dto.data.inline])`.
   d. Add a private flat→tree conversion helper used by the `.blocks` getter: stack-based algorithm as described in the Flat → DTO Conversion section, using `MutableBlockDto`.
   e. Implement `Blocks` with a **private constructor**: declare `#blocks: ReadonlyArray<Block>` as a private field; assign it and call the validation helper. Remove the old `public readonly blocks` field — it is replaced by the getter in step 1g.
   f. Implement `Blocks.from(dtos: ReadonlyArray<BlockDto>): Blocks` — calls the DTO→flat helper, then `new Blocks(...)`.
   g. Implement `get blocks(): ReadonlyArray<BlockDto>` — calls the flat→tree helper. **Checkpoint**: run `pnpm typecheck` — the file must compile before continuing.
   h. Rewrite `addBefore`, `addAfter`, `appendChild`, `prependChild`, `update`, `delete`. Methods that insert a new block accept `{ id: BlockId; data: Text }` (not a `Block` instance) and construct a `Block` internally with the appropriate `indent`. Rely on the constructor to enforce all invariants — do not duplicate validation checks already performed there.
   i. Rewrite `indent`, `unindent` using the flat-list algorithms and pseudocode from this plan.
   **Checkpoint (end of step 1)**: run `pnpm typecheck` — the file must compile with no errors before continuing.

2. Rewrite `blocks.test.ts`:
   - Read the existing `blocks.test.ts` first to identify current test scenarios and their labels (S1–S7, U1–U6) — the references below use those labels.
   - `Block` is no longer exported and `Blocks` constructor is private — `new Block(...)` and `new Blocks([...])` cannot be used. All test setup must use `Blocks.from([...dtos])`. Add a `dto(id, text?, children?)` helper returning `BlockDto` to reduce boilerplate.
   - Most existing test scenarios remain behaviorally valid (the observable `BlockDto` output is the same). **However, two scenarios produce different outcomes under the new flat semantics and must be updated:**
     - **S3** (`indent(B,C)` on `A[B], C[D], E`): old expected `A[B, C, D], E`; new model gives `A[B, C[D]], E` — because D's indent is unchanged and remains a child of C.
     - **U5** (`unindent(B,B)` on `A[B[X,Y], C], D`): old expected `A, B[X,Y,C], D`; new model gives `A, B[X[Y],C], D` — because the clamp pass preserves Y as a child of X.
   - Rewrite the above two with correct expectations for the new model.
   - Add the following new test cases (based on the plan's examples, not covered by S1–S7/U1–U6):
     - `indent`: evolving-state skip (plan example 2: `indent(A,C)` on `[A:0, B:1, C:1, D:0]` → B is skipped because its indent already exceeds A's, C is incremented)
     - `indent`: cross-level range (plan example 3: `indent(C,D)` on `[A:0, B:1, C:1, D:0, E:0]`)
     - `unindent`: clamping cascade (plan example: `unindent(A,B)` on `[A:0, B:1, C:2, D:1, E:0]`)
     - `indent` and `unindent`: `from === to` single-block cases (already partially in S2/U1, but add explicit single-block tests for edge cases like a block already at max indent)
   - **Checkpoint**: run `pnpm vitest run src/blocks/blocks.test.ts` — all tests must pass.

3. Update `serializer.ts`:
   - Remove `Block` from the import — only `Blocks`, `BlockDto`, and `BlockId` are needed.
   - Update `renderBlock` to accept `BlockDto` instead of `Block`.
   - Update `parse` to build `BlockDto[]` from the DOM and call `Blocks.from(dtos)` instead of `new Blocks(blocks)`.
   - **Checkpoint**: run `pnpm typecheck`.

4. Update `serializer.test.ts`:
   - Read the existing `serializer.test.ts`. Locate any test setup using `new Blocks([...])` directly (constructor is now private) or importing `Block` (no longer exported) — replace with `Blocks.from([...dtos])`.
   - DOM render/parse behavior is unchanged, so test assertions should not need updating — only setup code.
   - **Final checkpoint**: run `pnpm vitest run` — all tests across all files must pass.