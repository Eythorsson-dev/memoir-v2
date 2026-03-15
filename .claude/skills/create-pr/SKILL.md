---
name: create-pr
description: Automates the full pull request creation flow — re-signs commits, rebases on origin/master, force-pushes, creates the PR with gh, and opens it in the browser.
---

Perform the full PR creation flow for the current feature branch. Execute each step in order, stopping and reporting any error rather than continuing past a failure.

## Steps

### 1. Identify the current branch

```bash
git branch --show-current
```

Abort if the branch is `master` — PRs must come from feature branches.

### 2. Re-sign any unsigned commits

Check whether every commit on the branch (reachable from HEAD but not from `origin/master`) carries a GPG signature:

```bash
git log origin/master..HEAD --format="%H %G?"
```

If any line shows `G?` as `N` (no signature), re-sign the full range:

```bash
git rebase --exec "git commit --amend --no-edit -S" origin/master
```

### 3. Fetch and rebase on the latest origin/master

```bash
git fetch origin
git rebase --exec "git commit --amend --no-edit -S" origin/master
```

This rebases and ensures all commits — including any already-signed ones — remain signed after the rebase.

### 4. Force-push the branch

```bash
git push origin HEAD --force-with-lease
```

### 5. Derive PR title and body from commits

Inspect the commits that will be in the PR:

```bash
git log origin/master..HEAD --oneline
```

Compose a concise PR title (under 70 characters) and a markdown body summarising the changes. Use the commit messages as the primary source. The body should follow this structure:

```
## Summary
- <bullet points describing what changed and why>

## Test plan
- [ ] <key things a reviewer should verify>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 6. Create the PR

```bash
gh pr create --title "<title>" --body "<body>"
```

Capture the PR URL printed by `gh pr create`.

### 7. Open the PR in the browser

```bash
open <pr-url>
```

Report the PR URL to the user.
