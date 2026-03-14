# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Vite dev server (demo at index.html)
pnpm test         # run Vitest in watch mode
pnpm run test     # same as above
pnpm build        # build library to dist/
pnpm typecheck    # run tsc --noEmit
```

Run a single test file:
```bash
pnpm vitest run src/text/serializer.test.ts
```

Run tests once (CI style):
```bash
pnpm vitest run
```

## Development Workflow

**TDD is required.** For every feature or bug fix:
1. Write a failing test first and confirm it fails.
2. Implement the fix/feature.
3. Run `pnpm run test` and confirm all tests pass before finishing.

Use small, atomic commits with [Conventional Commits](https://www.conventionalcommits.org/) messages (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`).

**Commit after each completed and verified step** — do not batch multiple steps into one commit. Always create the commit automatically without asking for confirmation.

**Never commit plan documents** (`plans/` directory). These are local planning notes only.

**Errors must never fail silently.** All unexpected errors must throw. Never swallow exceptions or use empty catch blocks.

## Architecture

The project is a TypeScript library for a rich-text block editor. Three distinct layers:

### 1. Text Model — `src/text/text.ts`

Immutable value object (`Text`) representing a string with typed inline annotations (`Bold`, `Italic`, `Underline`). All invariants are enforced at construction time:

- Same-type inlines never overlap or touch (merge semantics in `addInline`).
- All ranges are bounded: `0 ≤ start < end ≤ text.length`.
- Inlines are always sorted (start asc, end desc).

Key methods: `addInline`, `removeInline`, `isToggled`. Every mutating method returns a new `Text` instance.

`InlineDtoMap` is a discriminated union — adding a new inline type requires updating it, which propagates exhaustiveness errors to the serializer automatically.

### 2. Serializer — `src/text/serializer.ts`

Bidirectional conversion between `Text` and arrays of DOM nodes.

- **Render:** `buildSegments()` splits text into contiguous segments sharing the same active inline stack, then `renderSegments()` recursively wraps them in the correct tags. Nesting order: longer (outer) inlines wrap shorter (inner) ones.
- **Parse:** `parseNode()` recursively walks DOM nodes, accumulating text and inline annotations. Zero-length inlines (e.g. `<strong><br></strong>` produced by browser Enter behaviour) are skipped.
- Tag mapping: `Bold ↔ <strong>`, `Italic ↔ <em>`, `Underline ↔ <u>`.

### 3. Editor — `src/editor/TextEditor.ts`

`TextEditor` is a self-contained UI component (no framework). It injects CSS, builds a toolbar + `contenteditable` div, and wires everything together.

- `_render()` serializes the current `Text` state to DOM and restores selection.
- `_handleInput()` parses the edited DOM back to `Text` and calls change listeners.
- `_applyOrRemoveInline()` toggles formatting on the current selection using `isToggled`.
- Selection is mapped between DOM positions and character offsets via `getCharOffset` / `findNodeAtOffset`.
- IME composition events are handled separately to avoid premature parses.
