# JSDoc Conventions

## Core Principle

JSDoc exists to encode **contracts that the type system cannot express** — not to restate what the signature already says. One accurate sentence beats three vague paragraphs. Stale or wrong JSDoc is actively harmful: LLMs and IDEs treat doc comments as ground truth and will follow the comment over the code when they diverge.

## When to Write JSDoc

Write a `/** ... */` doc comment when any of the following apply:

- **Exported public symbol** — any function, class, method, or type that consumers of the library will use.
- **Non-obvious precondition or invariant** — a constraint the caller must satisfy that the type does not capture (e.g. a range must be non-empty, an offset must be within bounds).
- **Throws** — TypeScript has no checked exceptions. Document every `@throws` with the error class and the condition that triggers it.
- **Side effects** — any observable effect beyond the return value (e.g. cancels pending timers, mutates shared state, emits events).
- **Parameter semantics not in the type** — units (`ms`), formats (UUID, ISO date), interval conventions (half-open `[start, end)`), valid ranges.
- **Deprecated symbol** — always add `@deprecated Use X instead.` to trigger IDE strikethrough.
- **Internal symbol in a public `.d.ts`** — add `/** @internal */` to enable API Extractor / TypeDoc stripping.

## When to Skip JSDoc

Skip JSDoc when:

- The name and signature are fully self-documenting (`getLength(): number`).
- The symbol is private (`#field`, `#method`) — use `//` if any comment is needed.
- The comment would only restate the TypeScript type (`@param {string} name - The name`).

Never add JSDoc to satisfy a line-count or coverage metric.

## Format

Follow TSDoc tag conventions:

```typescript
/**
 * Brief imperative-mood summary ending without a period (one line preferred).
 *
 * @remarks
 * Extended explanation of *why* this design was chosen, or non-obvious
 * behaviour. Wrap at 80 characters.
 *
 * @param name - What it represents; include units, format, or valid range
 *   when the type alone is insufficient.
 * @returns What the return value represents; omit if obvious from the type.
 * @throws {ErrorClass} Condition that causes the throw.
 *
 * @example
 * const t = new Text('hello world', [])
 * const t2 = t.addInline('Bold', 0, 5) // 'hello' is bold
 */
```

Rules:

- Summary line: imperative mood, no trailing period, ≤ 80 characters.
- Use `@remarks` for extended explanation — keep the summary one line.
- Omit `@param` and `@returns` when the prose adds nothing beyond the TypeScript type.
- `@example` blocks must be valid, runnable code — treat them as executable specifications.
- Do **not** include `@param {Type}` — TypeScript already has the type; repeating it is noise.

## `@example` Discipline

`@example` is the highest-ROI tag for both human readers and LLM code generation. Write one whenever:

- The usage is not obvious from the signature.
- There is a non-trivial precondition or a common misuse to guard against.
- The method is part of a fluent or composable API.

Keep examples minimal and focused on one behaviour. If multiple scenarios matter, use multiple `@example` blocks.

## LLM / Agentic Coding Context

LLMs treat doc comments as high-confidence intent declarations and generate code to match them — accurate docs produce accurate completions; wrong docs produce wrong completions. Therefore:

- **Accuracy over completeness.** An absent doc comment is neutral. An incorrect one is a bug multiplier.
- **Update JSDoc in the same commit as the implementation change.** Drift is the primary failure mode.
- **`@remarks` for design rationale** prevents agents from "optimising away" intentional choices (e.g. a deliberate O(n) scan, an explicit no-op branch, a try/catch that guards a known race).
- Trivial comments on every member degrade signal-to-noise ratio and train models to ignore doc comments. Write fewer, better ones.
