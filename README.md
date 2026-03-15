# Block Editor

A lightweight, framework-agnostic rich-text block editor written in pure TypeScript. No React, no Vue, no Svelte — just a class-based library you can drop into any project.

A SvelteKit demo application is included for development and exploration.

## Features

- **Block model** — content is represented as an ordered list of blocks, each containing a rich-text value
- **Inline formatting** — Bold, Italic, and Underline, with correct overlap/merge semantics
- **Toolbar** — formatting buttons with active-state feedback and keyboard-accessible tooltips
- **Immutable text model** — `Text` is an immutable value object; all mutations return a new instance
- **Bidirectional serialization** — lossless conversion between the `Text` model and DOM nodes
- **IME support** — composition events handled separately to avoid premature parses
- **Framework-agnostic** — no runtime dependency on any UI framework; integrates via a plain `HTMLElement`
- **TypeScript-first** — exhaustive discriminated unions; invalid states are unrepresentable at compile time

## Usage

Mount the editor by passing a container element to `BlockEditorWithToolbar`:

```typescript
import { BlockEditorWithToolbar, Blocks, Block } from './src/lib/block-editor'

const container = document.getElementById('editor')!
const initial = new Blocks([new Block()])

const editor = new BlockEditorWithToolbar(container, initial)

editor.onChange((blocks) => {
  console.log(blocks.toDto())
})

// Later, when done:
editor.destroy()
```

### Svelte 5 / SvelteKit

Use the `{@attach}` directive to integrate with the component lifecycle:

```svelte
<script lang="ts">
  import { BlockEditorWithToolbar, Blocks, Block } from '$lib/block-editor'

  const initial = new Blocks([new Block()])

  function mountEditor(node: HTMLElement) {
    const editor = new BlockEditorWithToolbar(node, initial)
    editor.onChange((blocks) => console.log(blocks.toDto()))
    return () => editor.destroy()
  }
</script>

<div {@attach mountEditor}></div>
```

## Public API

| Export | Description |
|---|---|
| `BlockEditorWithToolbar` | Full editor with formatting toolbar |
| `BlockEditor` | Editor without toolbar |
| `Blocks` | Ordered collection of `Block` instances |
| `Block` | A single block containing a `Text` value |
| `BlockOffset` | A position within a block |
| `BlockRange` | A selection range spanning one or more blocks |
| `BlockSelection` | Type representing the current editor selection |

## Development

```bash
pnpm install
pnpm dev          # start SvelteKit demo
pnpm vitest run   # run all tests
pnpm typecheck    # type-check with tsc
```

Tests live alongside source files (`*.test.ts`). TDD is required — write a failing test before implementing any change.