# Indent / Unindent – Visual Scenarios

Notation: `[root]` is the invisible list root. `←` marks the block(s) being moved.

---

## INDENT

### Rule recap
- Only blocks **at the same depth as `from`** that fall between `from` and `to`
  (inclusive, in pre-order) are eligible.
- Each eligible block is **appended to its previous sibling** (i.e. becomes
  the previous sibling's last child).
- If an eligible block has **no previous sibling** it is skipped (no-op).
- Operations are applied **left-to-right in document order** on the current
  (possibly already-mutated) tree.

---

### S1 – No previous sibling → no change
```
indent(C, C)

Before                        After
[root]                        [root]
├── A                         ├── A
└── B                         └── B
    ├── C  ← (first child)        ├── C   (no change)
    └── D                         └── D
```

### S2 – Single root block indented into its predecessor
```
indent(B, B)

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ←                          └── B
└── C                         └── C
```

### S3 – Range spans nested blocks; only same-depth blocks move
```
indent(B, D)   [B is depth-0; D is depth-1 (child of B)]

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ← (depth-0, eligible)      └── B
│   ├── C  (depth-1, skipped)         ├── C
│   └── D  (depth-1, skipped)         └── D
└── E                         └── E
```

### S4 – Multiple consecutive root blocks all indent
```
indent(B, C)

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ←                          ├── B  (appended to A)
├── C  ←                          └── C  (appended to A, because A is now C's prev sibling)
├── D                         ├── D
└── E                         └── E
```

Step-by-step for S4:
1. Indent B → prev sibling is A → tree becomes A[B], C, D, E
2. Indent C → prev sibling is now A → tree becomes A[B, C], D, E  ✓

### S5 – From and To both at the same level (larger range)
```
indent(B, D)   [all four blocks at root]

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ←                          ├── B
├── C  ←                          ├── C
├── D  ←                          └── D
└── E                         └── E
```

### S6 – No-op when the first block in the range has no predecessor
```
indent(A, C)

Before                        After
[root]                        [root]
├── A  ← (no prev sibling)    ├── A   (skipped)
├── B  ←                      └── A
├── C  ←                          └── B   (B → child of A)
└── D                                 └── C  (C → child of A after B was moved)
                              └── D
```
Step-by-step:
1. A → no prev sibling, skip.
2. B → prev sibling is A → A[B], C, D
3. C → prev sibling is A → A[B, C], D  ✓

---

## UNINDENT

### Rule recap
- Only blocks **at the same depth as `from`** between `from` and `to` are eligible.
- Each eligible block is:
  1. **Removed from its parent's children** along with all its **following siblings**.
  2. The following siblings are **appended to the block's existing children**.
  3. The (now-expanded) block is **inserted immediately after its parent** at
     the parent's level.
- Operations applied left-to-right on the current (mutated) tree.
- Root-level blocks (no parent) are silently skipped.

---

### U1 – Simple unindent, no following siblings
```
unindent(C, C)

Before                        After
[root]                        [root]
└── A                         └── A
    └── B                         ├── B
        └── C  ←                  └── C   (inserted after B)
```

### U2 – Following siblings become children
```
unindent(B, B)

Before                        After
[root]                        [root]
├── A                         ├── A   (empty)
│   ├── B  ←                  └── B
│   ├── C  (following)            ├── C
│   └── D  (following)            └── D
└── E                         └── E
```

### U3 – Partially nested: following siblings become children
```
unindent(C, C)

Before                        After
[root]                        [root]
└── A                         └── A
    └── B                         ├── B
        ├── C  ←                  └── C
        ├── D  (following)            ├── D
        └── E  (following)            └── E
```

### U4 – Range unindent (two consecutive children)
```
unindent(B, C)

Before                        After
[root]                        [root]
├── A                         ├── A   (empty after step 1)
│   ├── B  ←                  ├── B   (empty after step 2)
│   ├── C  ←                  ├── C
│   └── D                         └── D
└── E                         └── E
```

Step-by-step:
1. Unindent B: following siblings = [C, D] → new B has children [C, D].
   A becomes empty. B inserted after A.
   Tree: A[], B[C, D], E
2. Unindent C: C is now child of B (at depth 1 still). Following siblings = [D].
   new C gets children [D]. B becomes empty. C inserted after B.
   Tree: A, B, C[D], E  ✓

### U5 – Unindent with existing children + following siblings
```
unindent(B, B)

Before                        After
[root]                        [root]
├── A                         ├── A   (empty)
│   ├── B  ←                  └── B
│   │   ├── X  (existing)         ├── X
│   │   └── Y  (existing)         ├── Y
│   └── C  (following)            └── C
└── D                         └── D
```

New B's children = existing [X, Y] + following [C] = [X, Y, C]  ✓

### U6 – Root-level blocks are silently skipped
```
unindent(A, A)

Before                        After  (no change)
[root]                        [root]
├── A  ← (at root, no parent) ├── A
└── B                         └── B
```

---

## Edge cases to keep in mind

| Case | Behaviour |
|------|-----------|
| `from` comes after `to` in document order | throw |
| `from` not found in tree | throw |
| `to` not found in tree | throw |
| `from === to` | range of exactly one block |
| `from` and `to` at different depths | only blocks at `from`'s depth are included in the range |
