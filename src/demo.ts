import { Blocks, Block } from './blocks/blocks'
import { BlockEditorWithToolbar } from './editor/BlockEditorWithToolbar'
import type { BlockSelection } from './editor/BlockEditor'

const STORAGE_KEY = 'block-editor-demo-state'
const THEME_KEY = 'block-editor-demo-theme'
type Theme = 'system' | 'light' | 'dark'

function loadFromStorage(): Blocks | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return Blocks.from(JSON.parse(raw) as unknown as ReadonlyArray<Block>)
  } catch {
    return null
  }
}

function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

function nextTheme(current: Theme): Theme {
  return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'
}

const THEME_LABELS: Record<Theme, string> = {
  system: '🖥 System',
  light: '☀️ Light',
  dark: '🌙 Dark',
}

const storedTheme = (localStorage.getItem(THEME_KEY) ?? 'system') as Theme
let currentTheme: Theme = storedTheme
// Note: applyTheme not called here — the inline <head> script already applied it

const themeBtn = document.getElementById('theme-toggle')!
themeBtn.textContent = THEME_LABELS[currentTheme]

themeBtn.addEventListener('click', () => {
  currentTheme = nextTheme(currentTheme)
  applyTheme(currentTheme)
  localStorage.setItem(THEME_KEY, currentTheme)
  themeBtn.textContent = THEME_LABELS[currentTheme]
})

const initial = Blocks.from([
  new Block('b1', { text: 'Hello world!', inline: [{ type: 'Bold', start: 0, end: 5 }] }, [
    new Block('b2', { text: 'This is a nested block', inline: [{ type: 'Italic', start: 10, end: 16 }] }, []),
  ]),
  new Block('b3', { text: 'Another root block', inline: [] }, [
    new Block('b4', { text: 'Nested deeper', inline: [{ type: 'Underline', start: 0, end: 6 }] }, []),
  ]),
])

const initialBlocks = loadFromStorage() ?? initial
const editor = new BlockEditorWithToolbar(document.getElementById('editor-container')!, initialBlocks)

const jsonOutput = document.getElementById('json-output')!
const selectionOutput = document.getElementById('selection-output')!

jsonOutput.textContent = JSON.stringify(initialBlocks.blocks, null, 2)

editor.onChange((blocks) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks.blocks))
  jsonOutput.textContent = JSON.stringify(blocks.blocks, null, 2)
})

editor.onSelectionChange((sel: BlockSelection | null) => {
  selectionOutput.textContent = sel === null ? 'null' : JSON.stringify(sel, null, 2)
})
