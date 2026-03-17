/**
 * Discriminated union map of all inline annotation types.
 * The value type `never` signals that an inline carries no extra payload
 * beyond `type`, `start`, and `end`.
 *
 * Adding a new key here without updating every exhaustive switch in the
 * codebase will produce a TypeScript compile-time error.
 */
export type InlineDtoMap = {
  Italic: never
  Bold: never
  Underline: never
}

/** Union of all valid inline type names. */
export type InlineTypes = keyof InlineDtoMap

/** A single inline annotation applied over the half-open interval [start, end). */
export type InlineDto<Type extends InlineTypes = InlineTypes> = {
  type: Type
  start: number
  end: number
}

/** Plain-data shape of a Text value object; safe for JSON serialization. */
export type TextDto = {
  text: string
  inline: ReadonlyArray<InlineDto>
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a copy of `inlines` sorted by start ascending, then end descending.
 */
function sortInlines(inlines: InlineDto[]): InlineDto[] {
  return [...inlines].sort((a, b) => a.start - b.start || b.end - a.end)
}

/**
 * Validates range arguments shared across isToggled, addInline and removeInline.
 * @throws {RangeError} if start < 0, end <= start, or end > textLength.
 */
function validateRange(start: number, end: number, textLength: number): void {
  if (start < 0) throw new RangeError(`start must be >= 0, got ${start}`)
  if (end <= start) throw new RangeError(`end must be > start, got end=${end} start=${start}`)
  if (end > textLength) throw new RangeError(`end must be <= text.length (${textLength}), got ${end}`)
}

/**
 * Validates all inlines in the array against the given text length.
 * Also checks that no two same-type inlines overlap or touch.
 * @throws {RangeError} on any invariant violation.
 */
function validateInlines(inlines: InlineDto[], textLength: number): void {
  for (const inline of inlines) {
    validateRange(inline.start, inline.end, textLength)
  }

  // Group by type and check for overlap/touch within each group
  const byType = new Map<InlineTypes, InlineDto[]>()
  for (const inline of inlines) {
    const group = byType.get(inline.type)
    if (group) {
      group.push(inline)
    } else {
      byType.set(inline.type, [inline])
    }
  }

  for (const [, group] of byType) {
    const sorted = sortInlines(group)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      // overlap: curr.start < prev.end; touch: curr.start === prev.end
      if (curr.start <= prev.end) {
        throw new RangeError(
          `Same-type inlines of type '${curr.type}' overlap or touch: [${prev.start},${prev.end}) and [${curr.start},${curr.end})`
        )
      }
    }
  }
}

// ─── Text class ───────────────────────────────────────────────────────────────

/**
 * Immutable value object representing a string with typed inline annotations.
 *
 * Invariants (enforced by the constructor):
 * - Every inline must satisfy `start >= 0`, `end > start`, `end <= text.length`.
 * - No two same-type inlines may overlap or touch (`end` of one equals `start`
 *   of another counts as touching and is invalid).
 *
 * The `inline` array is always sorted by `start` ascending, then `end`
 * descending; the constructor auto-sorts the input.
 */
export class Text implements TextDto {
  public readonly text: string
  public readonly inline: ReadonlyArray<InlineDto>

  /**
   * @param text - The raw string content.
   * @param inline - Inline annotations. Will be auto-sorted; no need to
   *   pre-sort. All invariants are validated; throws on violation.
   * @throws {RangeError} if any invariant is violated.
   */
  constructor(text: string, inline: InlineDto[]) {
    validateInlines(inline, text.length)
    this.text = text
    this.inline = sortInlines(inline)
    Object.freeze(this)
  }

  /**
   * Returns `true` if this `Text` instance is field-by-field equal to `other`.
   * Comparison is index-by-index on the sorted `inline` array.
   */
  equals(other: Text): boolean {
    if (this.text !== other.text) return false
    if (this.inline.length !== other.inline.length) return false
    for (let i = 0; i < this.inline.length; i++) {
      const a = this.inline[i], b = other.inline[i]
      if (a.type !== b.type || a.start !== b.start || a.end !== b.end) return false
    }
    return true
  }

  /**
   * Returns only the `TextDto` fields so that `JSON.stringify(instance)`
   * produces a clean DTO without class-specific metadata.
   */
  toJSON(): TextDto {
    return {
      text: this.text,
      inline: this.inline as InlineDto[],
    }
  }

  /**
   * Returns `true` if a single inline of the given `type` covers the
   * entire half-open interval `[start, end)`.
   *
   * @param type - The inline type to query.
   * @param start - Inclusive start of the range (>= 0).
   * @param end - Exclusive end of the range (> start, <= text.length).
   * @returns `true` when exactly one inline of `type` satisfies
   *   `inline.start <= start && inline.end >= end`; `false` otherwise.
   * @throws {RangeError} if `start < 0`, `end <= start`, or `end > text.length`.
   */
  isToggled(type: InlineTypes, start: number, end: number): boolean {
    validateRange(start, end, this.text.length)
    return this.inline.some(
      (inline) => inline.type === type && inline.start <= start && inline.end >= end
    )
  }

  /**
   * Returns a new `Text` with the given inline type applied to `[start, end)`.
   *
   * All existing same-type inlines that overlap **or touch** the new range are
   * merged into a single inline spanning `min(all starts)` to `max(all ends)`.
   * Inlines of other types are left unchanged.
   *
   * @param type - The inline type to add.
   * @param start - Inclusive start of the range (>= 0).
   * @param end - Exclusive end of the range (> start, <= text.length).
   * @returns A new `Text` instance; the original is not mutated.
   * @throws {RangeError} if `start < 0`, `end <= start`, or `end > text.length`.
   */
  addInline(type: InlineTypes, start: number, end: number): Text {
    validateRange(start, end, this.text.length)

    const touching = this.inline.filter(
      (inline) => inline.type === type && inline.start <= end && inline.end >= start
    )

    const mergedStart = touching.reduce((min, inline) => Math.min(min, inline.start), start)
    const mergedEnd = touching.reduce((max, inline) => Math.max(max, inline.end), end)

    const others = this.inline.filter((inline) => !touching.includes(inline))
    const merged: InlineDto = { type, start: mergedStart, end: mergedEnd }

    return new Text(this.text, [...(others as InlineDto[]), merged])
  }

  /**
   * Returns a new `Text` with the given inline type removed from `[start, end)`.
   *
   * Only the `inline` array is affected — the `text` string is never modified.
   * For each existing same-type inline that overlaps the remove range:
   * - The portion **inside** the range is discarded.
   * - The portion(s) **outside** the range are preserved as separate inlines.
   * Inlines of other types, and non-overlapping inlines of the same type,
   * are left unchanged.
   *
   * @param type - The inline type to remove.
   * @param start - Inclusive start of the remove range (>= 0).
   * @param end - Exclusive end of the remove range (> start, <= text.length).
   * @returns A new `Text` instance; the original is not mutated.
   * @throws {RangeError} if `start < 0`, `end <= start`, or `end > text.length`.
   */
  /**
   * Splits the Text at the given character offset into two new `Text` instances.
   *
   * - An inline entirely left of offset (`end <= offset`) goes to the left half unchanged.
   * - An inline entirely right of offset (`start >= offset`) goes to the right half with offsets shifted by `-offset`.
   * - An inline strictly spanning the boundary (`start < offset < end`) is split: left gets `[start, offset)`, right gets `[0, end - offset)`.
   *
   * @throws {RangeError} if offset < 0 or offset > text.length.
   */
  split(offset: number): [Text, Text] {
    if (offset < 0) throw new RangeError(`offset must be >= 0, got ${offset}`)
    if (offset > this.text.length)
      throw new RangeError(`offset must be <= text.length (${this.text.length}), got ${offset}`)

    const leftInlines: InlineDto[] = []
    const rightInlines: InlineDto[] = []

    for (const inline of this.inline) {
      if (inline.end <= offset) {
        leftInlines.push(inline)
      } else if (inline.start >= offset) {
        rightInlines.push({ type: inline.type, start: inline.start - offset, end: inline.end - offset })
      } else {
        // start < offset < end — spans boundary
        leftInlines.push({ type: inline.type, start: inline.start, end: offset })
        rightInlines.push({ type: inline.type, start: 0, end: inline.end - offset })
      }
    }

    return [
      new Text(this.text.substring(0, offset), leftInlines),
      new Text(this.text.substring(offset), rightInlines),
    ]
  }

  /**
   * Concatenates two `Text` instances into one.
   * Right inlines are shifted by `left.text.length`. Touching same-type inlines at the
   * join boundary are merged automatically via `addInline`.
   */
  static merge(left: Text, right: Text): Text {
    let result = new Text(left.text + right.text, [])
    for (const inline of left.inline) {
      result = result.addInline(inline.type, inline.start, inline.end)
    }
    const shift = left.text.length
    for (const inline of right.inline) {
      result = result.addInline(inline.type, inline.start + shift, inline.end + shift)
    }
    return result
  }

  /**
   * Returns a new `Text` with `length` characters removed starting at `offset`.
   * Inline annotations are adjusted according to their overlap with the removed range.
   * Touching same-type inlines that result from the removal are merged automatically via `addInline`.
   *
   * @throws {RangeError} if offset < 0, length <= 0, or offset + length > text.length.
   */
  remove(offset: number, length: number): Text {
    if (offset < 0) throw new RangeError(`offset must be >= 0, got ${offset}`)
    if (length <= 0) throw new RangeError(`length must be > 0, got ${length}`)
    if (offset + length > this.text.length)
      throw new RangeError(
        `offset + length (${offset + length}) must be <= text.length (${this.text.length})`
      )

    const newText = this.text.substring(0, offset) + this.text.substring(offset + length)
    let result = new Text(newText, [])

    for (const inline of this.inline) {
      const end = offset + length

      if (inline.end <= offset) {
        // Entirely before — unchanged
        result = result.addInline(inline.type, inline.start, inline.end)
      } else if (inline.start >= end) {
        // Entirely after — shift left
        result = result.addInline(inline.type, inline.start - length, inline.end - length)
      } else if (inline.start >= offset && inline.end <= end) {
        // Entirely within removed range — drop
      } else if (inline.start < offset && inline.end > end) {
        // Spans entire removed range — shorten
        result = result.addInline(inline.type, inline.start, inline.end - length)
      } else if (inline.start < offset && inline.end <= end) {
        // Overlaps left boundary only — trim right side
        result = result.addInline(inline.type, inline.start, offset)
      } else {
        // Overlaps right boundary only (inline.start >= offset && inline.end > end)
        result = result.addInline(inline.type, offset, inline.end - length)
      }
    }

    return result
  }

  removeInline(type: InlineTypes, start: number, end: number): Text {
    validateRange(start, end, this.text.length)

    const newInlines: InlineDto[] = []

    for (const inline of this.inline) {
      if (inline.type !== type) {
        // Different type — keep as-is.
        newInlines.push(inline)
        continue
      }

      // No overlap with the remove range — keep as-is.
      if (inline.end <= start || inline.start >= end) {
        newInlines.push(inline)
        continue
      }

      // Keep the part before the remove range.
      if (inline.start < start) {
        newInlines.push({ type: inline.type, start: inline.start, end: start })
      }

      // Keep the part after the remove range.
      if (inline.end > end) {
        newInlines.push({ type: inline.type, start: end, end: inline.end })
      }
    }

    return new Text(this.text, newInlines)
  }
}
