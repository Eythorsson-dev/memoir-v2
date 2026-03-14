i want to add support for multiple paragraphs and indentation.

i want to implement something like notion has, where each paragraph is a block

the block indentation should use a tree

A block should have the following schema

```ts
type BlockId = string;

// TextDto is exported from src/text/text.ts — the serialized form of the Text type
type BlockDto = {
    id: BlockId,
    data: TextDto,
    children: ReadonlyArray<BlockDto>
}
```


Like Text, should you split the logic into two:
1. The Blocks domain model
2. The Serializer

## Architecture

src/
    blocks/
        blocks.ts <-- This is the domain model
        blocks.test.ts <-- This is the tests for the domain model
        serializer.ts <-- This is the serializer
        serializer.test.ts <-- This is the tests for the serializer

## The Blocks Model

The blocks domain model should be an immutable class.

The `Block` class references the `Text` class (not `TextDto`).

The caller is responsible for constructing `Block` instances before passing them to `Blocks`. ID generation is the caller's responsibility — `Block` and `Blocks` do not generate IDs.

Example of the Block class:
```ts

class Block {
    constructor(
        public readonly id: BlockId,
        public readonly data: Text,
        public readonly children: ReadonlyArray<Block>
    ) {
        // Throws if id is empty (id must be at least one character long)
    }
}
```

Example of the Blocks class:
```ts
class Blocks {
    constructor(
        public readonly blocks: ReadonlyArray<Block>
    ) {
        // Validates that all IDs are unique (including across nested children)
        // Throws if the array is empty
    }

    /**
     * `Blocks.from` is the intended entry point for constructing a `Blocks` instance
     * from plain data. The constructor is public and may be used directly, but
     * `Blocks.from` is the preferred API.
     *
     * Throws if the array is empty (via the constructor).
     */
    static from(dto: ReadonlyArray<BlockDto>): Blocks
    {
        // IMPLEMENTATION
    }
}
```

### Blocks model constraints (invariants):
- A block is identified by its Id
- The root `Blocks` instance must always contain at least one block — enforced in the constructor; `Blocks.from([])` throws for the same reason
- The constructor throws if any duplicate IDs are found (including across all nested children)
- `Block.children` is always a `ReadonlyArray<Block>` — an empty array means the block is a leaf node

### Methods

- `addBefore(id, block) -> Blocks`
    - Adds the new block as a sibling immediately before the specified block, at the same level in the tree
    - Throws if no block with the given id exists
    - Throws if the new block's id already exists anywhere in the tree (enforced by the `Blocks` constructor)
- `addAfter(id, block) -> Blocks`
    - Adds the new block as a sibling immediately after the specified block, at the same level in the tree
    - Throws if no block with the given id exists
    - Throws if the new block's id already exists anywhere in the tree (enforced by the `Blocks` constructor)
- `appendChild(id, block) -> Blocks`
    - Appends a block to the end of the specified block's children list
    - Throws if no block with the given id exists
    - Throws if the new block's id already exists anywhere in the tree (enforced by the `Blocks` constructor)
- `prependChild(id, block) -> Blocks`
    - Prepends a block to the beginning of the specified block's children list
    - Throws if no block with the given id exists
    - Throws if the new block's id already exists anywhere in the tree (enforced by the `Blocks` constructor)
- `update(id, data: Text) -> Blocks`
    - Returns a new `Blocks` instance with the matching block's `data` replaced by the given `Text`
    - Throws if no block with the given id exists
- `delete(id) -> Blocks`
    - Throws if no block with the given id exists
    - Throws if `block.children.length > 0` — the caller must explicitly delete or move all direct children before deleting the block
    - Throws if deleting the block would leave the root `Blocks` instance empty
    - Example: given a tree `A → [B → [C]]`, deleting `A` or `B` throws because both have children. The correct sequence is: delete `C`, then delete `B`, then delete `A`.
    - Test: deleting all children of a block one by one must succeed, leaving the parent with `children === []`


## The Serializer

- Move the `Serializer<T>` type in `src/text/serializer.ts` to a new file `src/serializer.ts`.
  Update all existing imports to use the new path.
- The Blocks serializer implements `Serializer<Blocks>` and operates on DOM nodes and the `Blocks` class.
- The serializer uses `src/text/serializer` to serialize the `Text` in `block.data`.
  - When rendering: the text serializer's output (an array of `Node`) is placed inside the `<p>` element.
  - When parsing: the `<p>` element's child nodes are extracted and passed to the text serializer — `textSerializer.parse([...pElement.childNodes])`. The text serializer does not know about the `<p>` wrapper.
- the Text serializer logic should still be inside `src/text/serializer.ts`

**Example of the serializer**
```ts
const blocksSerializer: Serializer<Blocks> = { render, parse }
```

### Roundtrip contract (applies to all `Serializer<T>` implementations)

`parse` and `render` must be exact inverses of each other:

```ts
JSON.stringify(serializer.parse(serializer.render(input))) === JSON.stringify(input)
```

This means `render` produces DOM nodes and `parse` accepts those same DOM nodes as input. Every serializer must include a roundtrip test that asserts this property.
- 

### Example:


the following code
```ts
let blocks = Blocks.from([
    {
        "id": "block-1",
        "data": { "text": "Hello World", "inline": [] },
        "children": [{
            "id": "block-2",
            "data": { "text": "This is a test", "inline": [] },
            "children": []
        }]
    },
    {
        "id": "block-3",
        "data": { "text": "This is another", "inline": [] },
        "children": []
    }
]);

const renderedOutput = blocksSerializer.render(blocks)
```

renderedOutput should be:
```html
<div class="block" id="block-1">
    <p>Hello World</p>
    <div class="children">
        <div class="block" id="block-2">
            <p>This is a test</p>
        </div>
    </div>
</div>
<div class="block" id="block-3">
    <p>This is another</p>
</div>
```
The `<div class="children">` wrapper is omitted when a block has no children (`children.length === 0`).

### Parse error handling

The `parse` method throws if the DOM does not match the expected format. This includes:
- A `.block` element missing its `id` attribute
- A `.block` element missing its `<p>` child
- Any element inside a `.block` other than `<p>` and `<div class="children">` (extra element types throw; extra attributes on recognised elements are ignored)
- Text nodes appearing directly inside a `.block` element or inside `<div class="children">` (throw)
- A `<div class="children">` element that exists but contains no children (an empty children wrapper is not valid; throw)
- Any child element inside `<div class="children">` that does not conform to the block schema

## Implementation plan
1. Move `Serializer<T>` to `src/serializer.ts` and update all imports
2. Implement the Blocks domain model (with tests)
3. Implement the Blocks Serializer (with tests)