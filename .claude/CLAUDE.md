# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Map

- `src/lib/block-editor/` — editor library (pure vanilla TypeScript, no framework)
- `src/routes/` — SvelteKit demo application (Svelte 5)
- `src/components/` — shared Svelte components used by the demo

## Commands

```bash
pnpm dev          # start SvelteKit dev server
pnpm build        # build the app
pnpm check        # run svelte-check
```

Run all tests once (CI style):
```bash
pnpm vitest run
```

Run a single test file:
```bash
pnpm vitest run src/lib/block-editor/text/text.test.ts
```

Watch mode (during development):
```bash
pnpm vitest
```

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

## Feature Worktrees

**Every new feature must be developed in a dedicated git worktree** — never directly on `master`. When starting a feature, create a worktree on a new branch:

```bash
git worktree add .claude/worktrees/<branch-name> -b <branch-name>
```

Work entirely within that worktree, then remove it after the PR is merged:

```bash
git worktree remove .claude/worktrees/<branch-name>
git branch -d <branch-name>
```

## Pull Request Workflow

**Use the `/create-pr` skill** to automate the full PR creation flow. It will:

1. Ensure all commits on the feature branch are GPG-signed — re-signs any unsigned commits with:
   ```bash
   git rebase --exec "git commit --amend --no-edit -S" origin/master
   ```
2. Fetch and rebase the branch on the latest `origin/master` (with signing).
3. Force-push with `--force-with-lease`.
4. Create the PR on GitHub using `gh pr create`.
5. Open the PR URL in the browser with `open <pr-url>`.

**GPG signing is required.** Branch protection on `master` enforces verified signatures. The signing key is already configured (`commit.gpgsign = true`, key `CD42639745A71184`). To re-sign all commits on a branch manually:

```bash
git rebase --exec "git commit --amend --no-edit -S" origin/master
```

## Area-Specific Rules

@rules/demo.md
@rules/blockEditor.md
@rules/git-conventions.md
@rules/toolbar-button-ux.md