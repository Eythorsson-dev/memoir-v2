# Git Conventions

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) with the seven rules from Chris Beams.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Subject Line Rules

1. **Imperative mood** — "Fix bug", not "Fixed bug" or "Fixing bug". Test: *"If applied, this commit will ___"*
2. **Capitalize** the first word
3. **No trailing period**
4. **≤50 characters** (hard cap 72 — GitHub truncates beyond that)
5. **Separate from body** with a blank line
6. **Do not describe how** — the diff shows that; the message explains why
7. **One concern per commit** — if you need "and", split the commit

### Types

| Type | Meaning |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `chore` | Maintenance (build, deps, config) |
| `perf` | Performance improvement |

Append `!` for breaking changes: `feat!: remove deprecated endpoint`

### Body

- Explain **what** and **why** — not how
- Wrap at **72 characters**
- Record context invisible in the diff: why this approach, what alternatives were considered, what side effects to expect

### Footers

Use [git trailers](https://git-scm.com/docs/git-interpret-trailers):

- `Fixes #123` / `Closes #456` — links and auto-closes an issue
- `BREAKING CHANGE: <description>` — required when `!` is used for tooling compatibility
- `Co-authored-by: Name <email>`

### Anti-Patterns

| Anti-pattern | Why bad |
|---|---|
| `fix`, `WIP`, `misc`, `updates` | Zero information |
| Past/gerund tense: `"fixed..."`, `"fixing..."` | Use imperative |
| `"add X and update Y"` | Two concerns — split the commit |
| Ticket number in subject (`JIRA-482 fix ...`) | Belongs in footer |
| No body on complex changes | Context lost forever |

### Good Example

```
fix: invalidate session cookie server-side on timeout

The old middleware expired cookies client-side only. A replayed
cookie within the 30-minute window could still authenticate
server-side.

Fixes #482
```

---

## Pull Request Descriptions

The description serves **reviewers today and future engineers indefinitely**. It must stand alone — never require Jira/Notion/Slack access to understand the change.

### Template

```markdown
## Summary
<!-- One to three sentences. What does this PR do at a high level? -->

## Why
<!-- What problem does this solve? Business context, user impact, or technical debt.
     Write this as if the reviewer joined yesterday and has no access to external tools.
     This is the most neglected and most valuable section. -->

## Changes
<!-- Bulleted list of notable changes. Summarise meaning, not mechanics — not a file list. -->
-

## Testing
<!-- How did you verify this works? Include commands, environments, and edge cases.
     "Tested locally" with no detail is not acceptable. -->
- [ ] Unit tests added / updated: `pnpm vitest run <path>`
- [ ] Manual testing steps:
  1.
  2.

## Screenshots / Recordings
<!-- Required for any UI change. Use a before/after Markdown table.
     For backend-only changes, include relevant terminal output or logs. -->

## Breaking Changes
- [ ] Yes — migration notes below
- [ ] No

<!-- If Yes: what breaks, who is affected, step-by-step migration path. -->

## Related Issues
<!-- "Closes #N" auto-closes on merge; "Related to #N" if only partial. -->
Closes #

## Checklist
- [ ] Self-reviewed the diff
- [ ] Tests pass locally (`pnpm vitest run`)
- [ ] Type-checked (`pnpm check`)
- [ ] No secrets or debug code included
- [ ] Breaking change documented (if applicable)

## Reviewer Notes
<!-- Suggested review order, high-risk areas to focus on, known limitations. -->
```

### The "Why" Section

The **"why"** outlasts the PR. Future engineers reading this code in two years will not have Slack history or sprint notes — they have only the PR description and the code.

- Bad: *"See JIRA-482"*
- Good: *"Session cookies require sticky sessions on our load balancer, which blocks horizontal scaling. JWT is stateless and removes that constraint."*

### Anti-Patterns

| Anti-pattern | Why bad |
|---|---|
| `"See ticket"` as the entire body | PR must stand alone |
| Repeating the diff line-by-line | Summarize meaning, not mechanics |
| Empty template sections | Noise — delete sections that don't apply |
| `"Tested locally"` with no detail | Means nothing to a reviewer |
| Burying breaking changes in a bullet list | Could cause surprise production incidents |

### Reviewer Guidance

- Suggest a **review order** — name the most important file first
- Flag **high-risk areas** explicitly
- Leave inline comments on your own diff to explain non-obvious decisions before reviewers arrive
- If parts of the diff are irrelevant noise (auto-formatted files, generated code), say so explicitly