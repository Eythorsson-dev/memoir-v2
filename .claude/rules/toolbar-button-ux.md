# Toolbar Button UX

Guidelines drawn from WCAG 2.2, WAI-ARIA APG, Material Design 3, Apple HIG, and Nielsen Norman Group.

## Button Ordering

- **Undo / Redo always come first** — they are the most universally needed actions and users expect them at the leading edge (left in LTR layouts). This matches every major editor: Word, Google Docs, Notion, Figma.
- Group related actions together: history (undo/redo) → text formatting (bold/italic/underline) → indentation.
- Use a visual separator (`<hr>` or CSS border) between logically distinct groups when the toolbar has 6+ buttons.

## Disabled State

- **Disabled buttons must not respond to hover.** A hover background implies the button is interactive; showing it on a disabled button is a direct contradiction. Use `:hover:not(:disabled)` in CSS.
- Reduce opacity to **0.35–0.4** for disabled buttons — enough to signal unavailability without being invisible.
- Set `cursor: default` (not `cursor: not-allowed`) on disabled buttons. `not-allowed` implies the user is doing something forbidden; `default` simply signals the action is unavailable right now.
- **Do not remove disabled buttons from the DOM** — their presence communicates that the feature exists. Hide them only if the feature is permanently unavailable in this context.
- Disabled buttons should still show a tooltip explaining *why* they are disabled when feasible (e.g., "Nothing to undo"). For simple toolbar buttons where the reason is obvious, the tooltip can be omitted.

## Active / Toggled State

- Use a distinct background + border (not just color) to communicate a toggled-on state. Color alone fails for colorblind users.
- Set `aria-pressed="true"` on toggle buttons (bold, italic, underline) when active. Use `aria-pressed="false"` when inactive — do not omit the attribute.
- The `:hover` style on an active (`.is-active`) button should still be visible but differentiated from the non-active hover.

## Tooltips

- Every icon-only button **must** have a tooltip — icon meaning is not universally understood.
- Show the keyboard shortcut inside the tooltip (e.g., `Bold ⌘B`). This is the primary discoverability mechanism for shortcuts.
- Tooltip delay: 300–500 ms on initial hover; 0 ms if the user moves between buttons without leaving the toolbar area.
- Never rely on `title` attribute alone — it is inaccessible on touch and has inconsistent browser styling. Use a custom `<span class="tooltip">` element.

## Accessibility

- Use `<button>` elements, never `<div>` or `<span>`, for toolbar actions. `<button>` gets keyboard focus, Enter/Space activation, and `disabled` support for free.
- Set `aria-label` on every icon button to a short, descriptive string (e.g., `"Undo"`, `"Bold"`).
- Toolbar container should have `role="toolbar"` and `aria-label="Text formatting"` to orient screen reader users.
- Arrow-key navigation within the toolbar (`role="toolbar"` with `roving tabindex`) is the ARIA APG pattern for toolbars, but is optional for small toolbars where Tab navigation is acceptable.

## Visual Sizing

- Minimum touch target: **44×44 px** (Apple HIG / WCAG 2.5.5). Icon size within can be smaller (16–20 px) with padding making up the remainder.
- Maintain consistent button size across all toolbar buttons, including disabled ones.

## Hover Effect

- Keep hover backgrounds subtle — a low-opacity fill or light border. The hover state should not compete with the active (`.is-active`) state visually.
- Remove hover effects on disabled buttons entirely (`:hover:not(:disabled)`).
- On touch devices, hover states are irrelevant — ensure active/pressed feedback via `:active` pseudo-class instead.
