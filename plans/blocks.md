i want to add support for multiple paragraphs and indentation.

i want to implement something like notion has, where each paragraph is a block

the block indentation should use a tree

A block should have the following schema

```ts
type BlockId = string;

type BlockDto = {
    id: BlockId,
    data: TextDto
    children: BlockDto[]
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

## The Text Model additions

Before implementing Blocks, add the following methods to the `Text` class:

- `split(offset: number): [Text, Text]`
    - Splits the Text at the given character offset into two Text instances.
    - Inlines are split/truncated at the boundary accordingly.
    - These will be used for future editor interactions (e.g. Enter key splits a block).
- `static merge(left: Text, right: Text): Text`
    - Concatenates two Text instances into one, adjusting inline offsets of `right` by `left.text.length`.
    - These will be used for future editor interactions (e.g. Backspace merges two blocks).

## The Blocks Model

The blocks domain model should be an immutable class.

The `Block` class references the `Text` class (not `TextDto`).

The constructor accepts a list of `Block` instances:
```ts
new Blocks(blocks: Block[])
```

The model should have the following methods:
- addBefore(id, block) -> Blocks
    - Adds a block before the specified block
    - An exception is thrown if there is no block with the id specified
- addAfter(id, block) -> Blocks
    - Adds a block after the specified block
    - An exception is thrown if there is no block with the id specified
- appendChild(id, block) -> Blocks
    - Appends a block to the end of the specified block's children list
    - An exception is thrown if there is no block with the id specified
- prependChild(id, block) -> Blocks
    - Prepends a block to the beginning of the specified block's children list
    - An exception is thrown if there is no block with the id specified
- delete(id) -> Blocks
    - An exception is thrown if there is no block with the id specified
    - An exception is thrown if the block has one or more children


### Blocks model constraints:
- A block is identified by its Id
- The BlockId is unique within the blocks boundary
- The blocks model must always contain at least one block


## The Serializer

- Move the `Serializer<T>` type in `src/text/serializer.ts` to a new file `src/serializer.ts`.
  Update all existing imports to use the new path.
- The Blocks serializer implements `Serializer<Blocks>` and operates on DOM nodes and the `Blocks` class.
- The serializer uses `src/text/serializer` to serialize the `Text` in `block.data`.

**Example of the serializer**
```ts
const blocksSerializer: Serializer<Blocks> = { render, parse }
```

The `<div class="children">` wrapper is omitted when a block has no children.

**Example HTML output:**
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

## Implementation plan
1. Implement `Text.split` and `Text.merge` (with tests)
2. Move `Serializer<T>` to `src/serializer.ts` and update all imports
3. Implement the Blocks domain model (with tests)
4. Implement the Blocks Serializer (with tests)
