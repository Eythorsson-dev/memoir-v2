export type Shortcut = {
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  key: string
}

export function formatShortcut(s: Shortcut): string {
  let result = ''
  if (s.ctrl) result += '⌘'
  if (s.alt) result += '⌥'
  if (s.shift) result += '⇧'
  result += s.key
  return result
}
