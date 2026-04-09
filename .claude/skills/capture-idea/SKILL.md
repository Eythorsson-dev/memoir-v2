---
name: capture-idea
description: Capture feature ideas through structured refinement, draft as reviewable markdown, then create GitHub issues. Use when the user has an idea to capture, wants to write up a feature, or says "capture idea".
---

Help me capture and refine a feature idea. Follow these steps in order:

## 1. Capture (bullet points only)

For each idea, write a short bullet-point summary:
- **Problem** — what pain or opportunity?
- **Solution** — one-sentence proposal
- **Why it matters** — who benefits and why?

Do NOT write full issue text yet. Get alignment on the bullets first.

## 2. Challenge (if the idea is fuzzy)

If the idea feels vague or the problem isn't crisp, use the `grill-me` skill to pressure-test it before drafting. Ask one question at a time. Stop when the problem and solution are clear.

## 3. Draft to file

Write full issue text to `plans/idea-draft.md` using the Write tool. Use this format per issue:

```markdown
# Issue: <title>

**Labels:** idea, <other labels>

## Problem
...

## Proposed Solution
...

## (other sections as needed)

---
```

When the user requests changes, use the Edit tool to apply only the diff — never rewrite the full file in chat.

## 4. Cross-reference

Before drafting, search existing GitHub issues for related work. Reference related issues by number in the draft. If the idea belongs to an existing epic, mention it.

## 5. Create on GitHub

Only create GitHub issues when the user explicitly approves. Apply the labels specified in the draft. If creating multiple issues that reference each other, create them in dependency order and update cross-references with actual issue numbers.

## Rules

- Never render full issue text in chat output — the file is the source of truth
- When showing changes, describe what changed in one sentence — the user reviews the diff in their editor
- Batch the user's feedback — ask if they have more changes before re-drafting
- Keep ideas in `plans/` — never commit plan documents per CLAUDE.md
