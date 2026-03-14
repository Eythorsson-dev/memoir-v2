Add `split` and `merge` methods to the `Text` class to support future editor interactions (e.g. Enter splits a block, Backspace merges two blocks).

## Methods

### `split(offset: number): [Text, Text]`

Splits the Text at the given character offset into two `Text` instances.
- `split(0)` returns `[new Text("", []), this]`
- `split(text.length)` returns `[this, new Text("", [])]`
- Throws if `offset < 0` or `offset > text.length`.

**Inline assignment rules** (for each inline `[start, end)`):

| Condition | Left half | Right half |
|---|---|---|
| `end <= offset` (entirely left) | `[start, end)` unchanged | not included |
| `start >= offset` (entirely right) | not included | `[start - offset, end - offset)` |
| `start < offset` and `end > offset` (spans boundary) | `[start, offset)` | `[0, end - offset)` |
| `start == offset` (touches boundary from right) | not included | `[0, end - offset)` |
| `end == offset` (touches boundary from left) | `[start, end)` unchanged | not included |

Summary: an inline is split only if `offset` falls **strictly inside** it (`start < offset < end`). An inline that merely touches the boundary at either end goes entirely to the corresponding half.

**Example** — inline `[2, 8)` in a text of length 10:

| offset | left | right |
|---|---|---|
| 1 | no inline | `[1, 7)` |
| 2 | no inline | `[0, 6)` |
| 4 | `[2, 4)` | `[0, 4)` |
| 8 | `[2, 8)` | no inline |

**Zero-length Text:** A `Text` with an empty string and no inlines (`new Text("", [])`) must be valid. If the constructor currently disallows this, adjust it.

---

### `static merge(left: Text, right: Text): Text`

Concatenates two `Text` instances into one.
- The result text is `left.text + right.text`.
- All inlines from `left` are kept as-is.
- All inlines from `right` have their offsets shifted by `left.text.length`.
- Same-type inlines that touch at the join boundary (e.g. `left` ends with Bold at its last character and `right` starts with Bold at its first character) are merged automatically.

**Implementation:** Construct the result by creating `new Text(left.text + right.text, [])` and then calling `addInline()` for each inline from both halves (right inlines shifted by `left.text.length`). Since `addInline` already merges touching same-type inlines, no extra merge logic is needed.

---

### `remove(offset: number, length: number): Text`

Returns a new `Text` with `length` characters removed starting at `offset`.
- Throws if `offset < 0`, `length <= 0`, or `offset + length > text.length`.


**Inline adjustment rules** (for each inline `[start, end)` and removed range `[offset, offset+length)`):

| Condition | Result |
|---|---|
| `end <= offset` (entirely before) | `[start, end)` unchanged |
| `start >= offset + length` (entirely after) | `[start - length, end - length)` |
| `start >= offset && end <= offset + length` (entirely within removed range) | dropped |
| `start < offset && end > offset + length` (spans entire removed range) | `[start, end - length)` |
| `start < offset && end <= offset + length` (overlaps left boundary only) | `[start, offset)` |
| `start >= offset && end > offset + length` (overlaps right boundary only) | `[offset, end - length)` |

After applying the offset adjustments, two same-type inlines may now touch or overlap (e.g. removing `(offset: 10, length: 5)` from inlines `[5,10)` and `[15,25)` yields `[5,10)` and `[10,20)`, which touch and must merge into `[5,20)`). This is handled automatically by the implementation strategy below.

**Implementation:** Construct the result by creating `new Text(this.text.substr(0, offset) + this.text.substr(offset + length, this.text.length), [])` and then calling `addInline()` for each adjusted inline. Since `addInline` already merges touching same-type inlines, no extra merge logic is needed. Note, when calling addInline we must take into account that the inline may be shorter, start earlier or have been removed due to the overlap of the provided offset, length range 

---

## Implementation plan
1. Adjust `Text` constructor to allow empty string if it does not already.
2. Implement `Text.prototype.split` (with tests).
3. Implement `Text.merge` as a static method (with tests).
4. Implement `Text.prototype.remove` (with tests).
