# vite component library
Please create a new vite git project inside the current repo.
Create a vanilla typescript vite component library and use vitest for testing.
Use pnpm as the package manager throughout (install, scripts, etc).
Use small, atomic commits with conventional commit messages.
Methods should document what they do, their side effects and exceptions.
Use TDD: Write tests before implementation.
After each phase create a commit using conventional commits.

## About the project

The project should have 2 parts: The model, and the renderer.

### Module: Text Model
The Text model is the backbone of the feature. The model should be an immutable value object with no knowledge of the rendering/parsing mechanisms.

The model is responsible for ensuring the validity of the data invariants:
- `start >= 0`
- `end > start`
- `end <= text.length`
- Inline ranges may overlap freely across different types
- Same type must never overlap or touch (enforced by invariant)
    - Example: `[{ "type": "Bold", "start": 5, "end": 15 }, { "type": "Bold", "start": 15, "end": 25 }]` is not valid. It should be represented as `[{ "type": "Bold", "start": 5, "end": 25 }]`
    - An inline is considered overlapping if the `end` of one equals the `start` of another — touching counts as overlapping for same-type inlines
- The `inline[]` array must be stored sorted by `start` ascending, then `end` descending — the constructor auto-sorts; it does not throw if the input is unsorted

Attempting to initialize an invalid instance of the Text value object should result in an exception being thrown.
There should be a test verifying this behavior.

The model should implement the Text type:
```ts
type InlineDtoMap = {
    Italic: never,
    Bold: never,
    Underline: never
}

type InlineTypes = keyof InlineDtoMap

type InlineDto<Type extends InlineTypes = InlineTypes> = {
    type: Type,
    start: number,
    end: number
}

type TextDto = {
    text: string,
    inline: InlineDto[]
}
```

Calling `JSON.stringify(textInstance)` should return only the fields from the `TextDto` type.
There should be a test verifying this behavior.

**Example of Text value object:**
```ts
class Text implements TextDto {

    constructor(
        public readonly text: string,
        public readonly inline: ReadonlyArray<InlineDto>
    ) {}

    /**
     * Returns true if the ENTIRE range [start, end) is covered
     * by at least one inline of the given type.
     */
    isToggled<Type extends InlineTypes>(type: Type, start: number, end: number): boolean {
        // implementation
    }

    /**
     * Returns a new Text with the given inline type applied to [start, end).
     * Merges with any existing same-type inlines that overlap or touch the new range.
     * Throws if type is invalid, start < 0, end <= start, or end > text.length.
     */
    addInline<Type extends InlineTypes>(type: Type, start: number, end: number): Text {
        // implementation
    }

    /**
     * Returns a new Text with the given inline type removed from [start, end).
     * Only modifies the inline[] array — the underlying text string is never changed.
     * Existing same-type inlines that partially overlap the range are trimmed;
     * those fully contained within the range are removed entirely.
     * Parts of existing inlines outside the range are preserved.
     * Throws if type is invalid, start < 0, end <= start, or end > text.length.
     */
    removeInline<Type extends InlineTypes>(type: Type, start: number, end: number): Text {
        // implementation
    }
}
```

#### `addInline` behaviour
- Finds all existing same-type inlines that overlap **or touch** the new range (touch = `end` of one equals `start` of another).
- Merges them all together with the new range into a single inline spanning `min(all starts)` to `max(all ends)`.
- Example: existing `Bold [5,15]` and `Bold [20,30]`, adding `Bold [15,35]`:
  - `[5,15)` touches `[15,35)` → merge; `[15,35)` overlaps `[20,30)` → merge
  - Merged span: min(5,15,20)=5, max(15,35,30)=35 → `Bold [5,35]` ✓

#### `removeInline` behaviour
- Only affects the `inline[]` array. The `text` string is never modified.
- For each existing same-type inline that overlaps the remove range:
  - The portion inside the remove range is discarded.
  - The portion(s) outside the remove range are kept as separate inlines.
- Example: existing `Bold [3,18]`, `removeInline Bold [5,20]`:
  - Part before remove range: `[3,5)` → `Bold [3,5]` ✓
  - Part after remove range: none (existing inline ends at 18, before remove end of 20)
- Example: existing `Bold [5,15]`, `removeInline Bold [3,18]`:
  - Remove range fully contains the existing inline → entire inline is removed.

### Module: Text Render and Parsing
Create a feature to render and parse the Text model into DOM nodes.

**JSON example:**
```json
{
    "text": "Hello world, this is a test",
    "inline": [
        { "type": "Bold", "start": 5, "end": 15 },
        { "type": "Italic", "start": 10, "end": 20 }
    ]
}
```
This example should be rendered to:

`Hello<strong> worl<em>d, th</em></strong><em>is is</em> a test`

**Nesting order:** inlines are processed sorted by `start` ascending, then by `end` descending (longest first when two inlines share the same start). This determines which element is the outer wrapper when inlines overlap.

**Serializer type:**
```ts
type Serializer<T> = {
    parse(nodes: Node[]): T,
    render(item: T): Node[]
}

type TextSerializer = Serializer<Text>
```

- `render(text)` returns an array of `Node` instances representing the formatted content.
- `parse(nodes)` reconstructs a `Text` instance from the output of `render`. It is only required to correctly handle output produced by `render` (not arbitrary HTML).
- Roundtrip invariant: `JSON.stringify(parse(render(text)))` must equal `JSON.stringify(text)`.

Each inline type maps to a specific HTML element:
- `Bold` → `<strong>`
- `Italic` → `<em>`
- `Underline` → `<u>`

The implementation must leverage TypeScript so that adding a new inline type to `InlineDtoMap` without updating the serializer produces a **compile-time error**.

## Architecture

```
src/
    text/
        text.ts            <- Text value object implementation
        text.test.ts       <- Tests for the Text model
        serializer.ts      <- Renders and parses Text to/from Node[]
        serializer.test.ts <- Tests for the serializer
```

## Acceptance criteria
- All existing and new tests must pass (`pnpm run vitest`)
- No TypeScript compilation errors

## Implementation plan
1. Create the git project and set up the vite project (pnpm, vitest, TypeScript)
2. Create the Text model with tests validating:
   - Data invariants (start >= 0, end > start, end <= text.length, no same-type overlap/touch)
   - `addInline` merging behaviour
   - `removeInline` trimming behaviour
   - `isToggled` returns true only when the entire range is covered
   - `JSON.stringify` serializes only `TextDto` fields
3. Create the Serializer with tests validating:
   - Nested inline rendering
   - Correct nesting order (start asc, then end desc)
   - Parse/render roundtrip

