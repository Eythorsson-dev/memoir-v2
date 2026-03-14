# Indent / Unindent – Visual Scenarios

Notation: `[root]` is the invisible list root. `←` marks the block(s) being moved.

---

## INDENT

### Rules
- **Range** = all blocks in pre-order from `from` to `to` (inclusive) — no depth filter.
- Blocks are processed left-to-right (pre-order) within the range.
- For each block (unless already marked as moved):
  - If it has **no previous sibling** at its current level → skip (no-op).
  - Otherwise → move it to become the **last child of its previous sibling**:
    - Children **in the range** stay with the block (move as one unit). Mark them as moved; skip when their turn comes.
    - Children **not in the range** are extracted and inserted **after** the moved block in the new parent.

---

### S1 – No previous sibling → no change
```
indent(C, C)   range=[C]

Before                        After
[root]                        [root]
├── A                         ├── A
└── B                         └── B
    ├── C  ← (first child)        ├── C   (no change — no previous sibling)
    └── D                         └── D
```

### S2 – Single block indented into its predecessor
```
indent(B, B)   range=[B]

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ←                          └── B
└── C                         └── C
```

### S3 – Range stops before a nested block → nested block is extracted
```
indent(B, C)   range=[B, C]   (D is NOT in range)

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ← (no children)            ├── B     (appended to A)
├── C  ← (child D not in range)   ├── C     (appended to A; D extracted)
│   └── D  (extracted → after C)  └── D     (placed after C in A)
└── E                         └── E
```

### S4 – Range includes nested block → nested block travels with its parent
```
indent(B, D)   range=[B, C, D]   (D IS in range)

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ← (no children)            ├── B     (appended to A)
├── C  ← (child D in range)       └── C     (appended to A; D stays with C)
│   └── D  (stays with C) →           └── D
└── E                         └── E
```

### S5 – Range covers multiple root blocks, all flat
```
indent(B, C)   range=[B, C]

Before                        After
[root]                        [root]
├── A                         └── A
├── B  ←                          ├── B   (appended to A)
├── C  ←                          └── C   (A is now C's prev sibling → also appended to A)
├── D                         ├── D
└── E                         └── E
```

Step-by-step:
1. B → prev sibling A → `A[B], C, D, E`
2. C → prev sibling A → `A[B, C], D, E`

### S6 – Range spans deeper nested block; only top-most in range moves first
```
indent(B, D)   range=[B, C, D]   where B has children C, D

Before                        After
[root]                        [root]
├── A                         └── A
└── B  ←                          └── B
    ├── C  (range child → stays)       ├── C
    └── D  (range child → stays)       └── D
└── E                         └── E
```
C and D are in range and are B's children → they travel with B. Both are marked
as moved and skipped when their turn comes in the iteration.

### S7 – First block in range has no previous sibling (skipped), later ones indent
```
indent(A, C)   range=[A, B, C]

Before                        After
[root]                        [root]
├── A  ← (no prev sibling)    ├── A    (skipped)
├── B  ←                      └── A
├── C  ←                          ├── B   (prev sibling A → appended)
└── D                                 └── C   (prev sibling A → appended)
                              └── D
```

---

## UNINDENT

### Rules
- **Range** = all blocks in pre-order from `from` to `to` (inclusive) — no depth filter.
- Blocks are processed left-to-right (pre-order) within the range.
- For each block:
  - If it is at the **root level** (no parent) → skip (no-op).
  - Otherwise:
    1. Collect all **following siblings** of the block inside its parent.
    2. Append those following siblings to the block's **existing children**.
    3. Remove the block (now with expanded children) and all its former following siblings from the parent.
    4. Insert the block **immediately after its parent** at the parent's level.

---

### U1 – Simple unindent, no following siblings
```
unindent(C, C)

Before                        After
[root]                        [root]
└── A                         └── A
    └── B                         ├── B
        └── C  ←                  └── C   (inserted after B in A)
```

### U2 – Following siblings become children
```
unindent(B, B)

Before                        After
[root]                        [root]
├── A                         ├── A   (now empty)
│   ├── B  ←                  └── B
│   ├── C  (following → child)    ├── C
│   └── D  (following → child)    └── D
└── E                         └── E
```

### U3 – Partial following siblings become children
```
unindent(C, C)

Before                        After
[root]                        [root]
└── A                         └── A
    └── B                         ├── B
        ├── C  ←                  └── C
        ├── D  (following → child)    ├── D
        └── E  (following → child)    └── E
```

### U4 – Range unindent (step-by-step)
```
unindent(B, C)

Before              Step 1: unindent B       Step 2: unindent C
[root]              [root]                   [root]
├── A               ├── A  (empty)           ├── A
│   ├── B  ←        └── B                    ├── B  (empty)
│   ├── C  ←            ├── C  ←             ├── C
│   └── D               └── D                    └── D
└── E               └── E                    └── E
```

Step 1: B's following siblings = [C, D] → new B = B[C, D]. A becomes empty. B inserted after A.
Step 2: C is now child of B. C's following siblings = [D] → new C = C[D]. B becomes empty. C inserted after B.

### U5 – Existing children + following siblings merge
```
unindent(B, B)

Before                        After
[root]                        [root]
├── A                         ├── A   (empty)
│   ├── B  ←                  └── B
│   │   ├── X  (existing)         ├── X
│   │   └── Y  (existing)         ├── Y
│   └── C  (following → child)    └── C
└── D                         └── D
```
New B's children = existing [X, Y] + following [C] = [X, Y, C]

### U6 – Root-level blocks are skipped
```
unindent(A, A)

Before                        After  (no change)
[root]                        [root]
├── A  ← (root, no parent)    ├── A
└── B                         └── B
```

---

## Edge cases

| Case | Behaviour |
|------|-----------|
| `from` comes after `to` in document order | throw |
| `from` not found in tree | throw |
| `to` not found in tree | throw |
| `from === to` | range of exactly one block |
| Block in range has no previous sibling (indent) | skip that block |
| Block in range is at root level (unindent) | skip that block |
