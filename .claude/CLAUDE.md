# CLAUDE.md


## Repository Map

- `src/lib/block-editor/` — editor library (pure vanilla TypeScript, no framework)
- `src/routes/` — SvelteKit demo application (Svelte 5)
- `src/components/` — shared Svelte components used by the demo

## Development Workflow

**TDD is required.** For every feature or bug fix:
1. Write a failing test first and confirm it fails.
2. Implement the fix/feature.
3. Run `pnpm vitest run` and confirm all tests pass.
4. Run `pnpm check` to catch any type errors.

Use small, atomic commits. Follow the commit message and PR description conventions in `@rules/git-conventions.md`.

**Commit after each completed and verified step** — do not batch multiple steps into one commit. Ask for confirmation before committing.

**Never commit plan documents** (`plans/` directory). These are local planning notes only.

**Errors must never fail silently.** All unexpected errors must throw. Never swallow exceptions or use empty catch blocks.

**Ask before assuming.** When a task is ambiguous — unclear requirements, multiple valid approaches, or missing context — use the `AskUserQuestion` tool to clarify before implementing. Never guess or pick an arbitrary direction silently.

**Prefer build-time errors over runtime errors.** Use TypeScript's type system to make invalid states unrepresentable. Favour exhaustive `switch` statements (with a `never` default), discriminated unions, and strict types so that mistakes are caught by `tsc` or tests — not at runtime in production.

**Use the `frontend-design` skill** when building or significantly redesigning UI components, pages, or layouts in the demo application. Invoke it via the Skill tool before writing Svelte/CSS code for any non-trivial UI work.

## Area-Specific Rules

@rules/demo.md
@rules/blockEditor.md
@rules/git-conventions.md
@rules/toolbar-button-ux.md
@rules/jsdoc.md
