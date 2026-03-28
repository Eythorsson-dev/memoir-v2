/** Valid hue names for highlight annotations. */
export type HighlightColor = 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'fuchsia'

/** Intensity/brightness level for highlight annotations. */
export type Shade = 'light' | 'medium' | 'dark'

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
  Highlight: { color: HighlightColor; shade: Shade }
}

/** Union of all valid inline type names. */
export type InlineTypes = keyof InlineDtoMap

/**
 * A single inline annotation applied over the half-open interval [start, end).
 * For types with payload (e.g. Highlight), the payload fields are spread
 * directly onto the object alongside `type`, `start`, and `end`.
 */
export type InlineDto<Type extends InlineTypes = InlineTypes> = Type extends InlineTypes
  ? { type: Type; start: number; end: number } & (InlineDtoMap[Type] extends never ? unknown : InlineDtoMap[Type])
  : never

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
  return [...inlines].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type)
  )
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
 * Compares the payload fields (all keys except type, start, end) of two
 * InlineDto objects. Returns true if both carry the same payload.
 * Never-payload inlines (Bold, Italic, Underline) always compare equal.
 */
function inlinePayloadEqual(a: InlineDto, b: InlineDto): boolean {
  const { type: _at, start: _as, end: _ae, ...payloadA } = a as Record<string, unknown>
  const { type: _bt, start: _bs, end: _be, ...payloadB } = b as Record<string, unknown>
  const keysA = Object.keys(payloadA).sort()
  const keysB = Object.keys(payloadB).sort()
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => payloadA[k] === payloadB[k])
}

/**
 * Validates all inlines in the array against the given text length.
 * Also checks that no two same-type inlines overlap; same-type inlines may
 * touch (end === start) only when they carry different payloads.
 * @throws {RangeError} on any invariant violation.
 */
function validateInlines(inlines: InlineDto[], textLength: number): void {
  for (const inline of inlines) {
    validateRange(inline.start, inline.end, textLength)
  }

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
      if (curr.start < prev.end) {
        throw new RangeError(
          `Same-type inlines of type '${curr.type}' overlap: [${prev.start},${prev.end}) and [${curr.start},${curr.end})`
        )
      }
      // Touching (curr.start === prev.end) is only invalid when payloads are equal
      // (two adjacent same-color Highlights should have been merged).
      if (curr.start === prev.end && inlinePayloadEqual(prev, curr)) {
        throw new RangeError(
          `Same-type same-payload inlines of type '${curr.type}' touch: [${prev.start},${prev.end}) and [${curr.start},${curr.end})`
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
 * - No two same-type inlines may overlap.
 * - No two same-type, same-payload inlines may touch (`end` of one equals
 *   `start` of another counts as touching and is invalid — they should be merged).
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
   * Comparison is index-by-index on the sorted `inline` array, including payload.
   */
  equals(other: Text): boolean {
    if (this.text !== other.text) return false
    if (this.inline.length !== other.inline.length) return false
    for (let i = 0; i < this.inline.length; i++) {
      const a = this.inline[i], b = other.inline[i]
      if (a.type !== b.type || a.start !== b.start || a.end !== b.end) return false
      if (!inlinePayloadEqual(a, b)) return false
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
   * Returns `true` if a single inline matching the given `dto`'s type **and**
   * payload covers the entire half-open interval `[dto.start, dto.end)`.
   *
   * @param dto - The inline descriptor to query; `start` and `end` define the range.
   * @throws {RangeError} if `dto.start < 0`, `dto.end <= dto.start`, or `dto.end > text.length`.
   */
  isToggled(dto: InlineDto): boolean {
    const { type, start, end } = dto
    validateRange(start, end, this.text.length)
    return (this.inline as InlineDto[]).some(
      (i) => i.type === type && i.start <= start && i.end >= end && inlinePayloadEqual(i, dto)
    )
  }

  /**
   * Returns `true` if any inline of the given `type` (regardless of payload)
   * covers the entire half-open interval `[start, end)`.
   *
   * @throws {RangeError} if `start < 0`, `end <= start`, or `end > text.length`.
   */
  isCoveredByType(type: InlineTypes, start: number, end: number): boolean {
    validateRange(start, end, this.text.length)
    return this.inline.some((i) => i.type === type && i.start <= start && i.end >= end)
  }

  /**
   * Returns a new `Text` with the given inline applied to the range
   * `[inline.start, inline.end)`.
   *
   * Existing same-type, same-payload inlines that overlap **or touch** the new
   * range are merged into a single inline. Inlines of other types or different
   * payloads are left unchanged.
   *
   * @param inline - Full inline descriptor including any payload fields.
   * @returns A new `Text` instance; the original is not mutated.
   * @throws {RangeError} if the range is invalid.
   */
  addInline(inline: InlineDto): Text {
    const { type, start, end } = inline
    validateRange(start, end, this.text.length)

    const inlines = this.inline as InlineDto[]

    // Merge only touching/overlapping inlines with the same payload
    const touching = inlines.filter(
      (existing) =>
        existing.type === type &&
        existing.start <= end &&
        existing.end >= start &&
        inlinePayloadEqual(existing, inline)
    )

    const mergedStart = touching.reduce((min, i) => Math.min(min, i.start), start)
    const mergedEnd = touching.reduce((max, i) => Math.max(max, i.end), end)

    const others = inlines.filter((i) => !touching.includes(i))
    // Normalize key order: type, start, end, then payload — so JSON.stringify is stable
    const { type: _t, start: _s, end: _e, ...payload } = inline as Record<string, unknown>
    const merged = { type, start: mergedStart, end: mergedEnd, ...payload } as InlineDto

    return new Text(this.text, [...others, merged])
  }

  /**
   * Splits the Text at the given character offset into two new `Text` instances.
   * Payload fields on split inlines are preserved.
   *
   * @throws {RangeError} if offset < 0 or offset > text.length.
   */
  split(offset: number): [Text, Text] {
    if (offset < 0) throw new RangeError(`offset must be >= 0, got ${offset}`)
    if (offset > this.text.length)
      throw new RangeError(`offset must be <= text.length (${this.text.length}), got ${offset}`)

    const leftInlines: InlineDto[] = []
    const rightInlines: InlineDto[] = []

    for (const inline of this.inline as InlineDto[]) {
      if (inline.end <= offset) {
        leftInlines.push(inline)
      } else if (inline.start >= offset) {
        rightInlines.push({ ...inline, start: inline.start - offset, end: inline.end - offset } as InlineDto)
      } else {
        // start < offset < end — spans boundary
        leftInlines.push({ ...inline, start: inline.start, end: offset } as InlineDto)
        rightInlines.push({ ...inline, start: 0, end: inline.end - offset } as InlineDto)
      }
    }

    return [
      new Text(this.text.substring(0, offset), leftInlines),
      new Text(this.text.substring(offset), rightInlines),
    ]
  }

  /**
   * Concatenates two `Text` instances into one.
   * Right inlines are shifted by `left.text.length`. Touching same-type
   * same-payload inlines at the join boundary are merged automatically.
   */
  static merge(left: Text, right: Text): Text {
    let result = new Text(left.text + right.text, [])
    for (const inline of left.inline as InlineDto[]) {
      result = result.addInline(inline)
    }
    const shift = left.text.length
    for (const inline of right.inline as InlineDto[]) {
      result = result.addInline({ ...inline, start: inline.start + shift, end: inline.end + shift } as InlineDto)
    }
    return result
  }

  /**
   * Returns a new `Text` with `length` characters removed starting at `offset`.
   * Inline annotations are adjusted; payload fields are preserved.
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

    for (const inline of this.inline as InlineDto[]) {
      const end = offset + length

      if (inline.end <= offset) {
        result = result.addInline(inline)
      } else if (inline.start >= end) {
        result = result.addInline({ ...inline, start: inline.start - length, end: inline.end - length } as InlineDto)
      } else if (inline.start >= offset && inline.end <= end) {
        // Entirely within removed range — drop
      } else if (inline.start < offset && inline.end > end) {
        result = result.addInline({ ...inline, start: inline.start, end: inline.end - length } as InlineDto)
      } else if (inline.start < offset && inline.end <= end) {
        result = result.addInline({ ...inline, start: inline.start, end: offset } as InlineDto)
      } else {
        result = result.addInline({ ...inline, start: offset, end: inline.end - length } as InlineDto)
      }
    }

    return result
  }

  /**
   * Returns a new `Text` with all inlines of the given `type` removed from
   * `[start, end)`, regardless of payload.
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

    for (const inline of this.inline as InlineDto[]) {
      if (inline.type !== type) {
        newInlines.push(inline)
        continue
      }

      if (inline.end <= start || inline.start >= end) {
        newInlines.push(inline)
        continue
      }

      if (inline.start < start) {
        newInlines.push({ ...inline, start: inline.start, end: start } as InlineDto)
      }

      if (inline.end > end) {
        newInlines.push({ ...inline, start: end, end: inline.end } as InlineDto)
      }
    }

    return new Text(this.text, newInlines)
  }
}
