# Demo Application

## File Structure

- `src/routes/+page.svelte` — main demo page
- `src/routes/+layout.svelte` — root layout; imports `layout.css`
- `src/routes/layout.css` — global CSS and CSS custom properties (uses Tailwind via `@import 'tailwindcss'`)
- `src/components/` — shared Svelte components

## Boundary Rule

The demo **must not** contain business logic. It imports from the editor library via `$lib/block-editor` and wires it to the DOM — nothing more. Never re-implement editor behaviour in Svelte.

## Icons

Use **`@lucide/svelte`** for all icons in the demo. Never use emoji, Unicode symbols, or CSS pseudo-element characters as icon substitutes.

```svelte
<script lang="ts">
  import { ChevronRight, X } from '@lucide/svelte'
</script>

<ChevronRight />
```

## CSS

- Global styles and CSS custom properties go in `src/routes/layout.css`.
- Use Tailwind utility classes in component templates. Add a `<style>` block only when the styling cannot be expressed with Tailwind (e.g. targeting third-party library class names). Do not create separate `.css` files for Svelte components.

## Importing the Editor Library

Always import from the `$lib/block-editor` alias — never use relative paths into `src/lib/`:

```svelte
<script lang="ts">
  import { BlockEditorWithToolbar, Blocks, Block } from '$lib/block-editor'
  import type { BlockSelection } from '$lib/block-editor'
</script>
```

## Mounting the Editor

Use `{@attach}` to hand a DOM node to the vanilla JS editor — the idiomatic Svelte 5 pattern for integrating class-based libraries.

## Svelte MCP Server

A Svelte MCP server is available with comprehensive Svelte 5 and SvelteKit documentation. Use the following tools when working on Svelte code:

- **`list-sections`** — discover available documentation sections. Call this first when working on any Svelte/SvelteKit topic.
- **`get-documentation`** — fetch full content for one or more sections. After `list-sections`, fetch all sections relevant to the task.
- **`svelte-autofixer`** — analyzes Svelte code and returns issues and suggestions. Call this before finalizing any Svelte code; keep calling until no issues remain.
- **`playground-link`** — generates a Svelte Playground link. Only call after user confirmation, and never when code has already been written to project files.

## Syntax Highlighting

`prismjs` must only be imported inside `src/components/code-preview.svelte`.
`CodePreview` renders a bare highlighted `<pre>` — no collapsible wrapper.
Never import `prismjs` directly in other components.

## Component Responsibilities

- `CollapsibleSection` — renders a `<details>` toggle; has no knowledge of persistence.
  If open/closed state must survive a page reload, the **parent** manages it
  (e.g. `$state` + `$effect` writing to `localStorage`), then binds with `bind:open`.
- `CodePreview` — renders syntax-highlighted code; has no collapsible wrapper.
  Wrap in `<CollapsibleSection>` at the call site when a collapsible UI is needed.

## Svelte 5 Conventions

- Use runes: `$state` for reactive values, `$derived` for computed values, `$effect` only as a last resort.
- When seeding `$state` from a prop that is a one-time default, wrap with `untrack` to silence the `state_referenced_locally` warning:
  ```svelte
  import { untrack } from 'svelte'
  let width = $state(untrack(() => defaultWidth))
  ```
- Use callback props (`let { onchange } = $props()`) instead of `createEventDispatcher`.
- Use snippets (`{#snippet ...}`) instead of named slots.
- Component files: `kebab-case.svelte`; imported as `PascalCase`.
- Use `lang="ts"` (not `lang="typescript"`) on `<script>` tags.
