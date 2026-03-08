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
  inline: InlineDto[]
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
