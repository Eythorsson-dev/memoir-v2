import { Blocks, Block } from './blocks/blocks'
import { BlockEditorWithToolbar } from './editor/BlockEditorWithToolbar'
import type { BlockSelection } from './editor/BlockEditor'

const initial = Blocks.from([
  new Block('b1', { text: 'Hello world!', inline: [{ type: 'Bold', start: 0, end: 5 }] }, [
    new Block('b2', { text: 'This is a nested block', inline: [{ type: 'Italic', start: 10, end: 16 }] }, []),
  ]),
  new Block('b3', { text: 'Another root block', inline: [] }, [
    new Block('b4', { text: 'Nested deeper', inline: [{ type: 'Underline', start: 0, end: 6 }] }, []),
  ]),
])

const editor = new BlockEditorWithToolbar(document.getElementById('editor-container')!, initial)

const jsonOutput = document.getElementById('json-output')!
const selectionOutput = document.getElementById('selection-output')!

jsonOutput.textContent = JSON.stringify(initial.blocks, null, 2)

editor.onChange((blocks) => {
  jsonOutput.textContent = JSON.stringify(blocks.blocks, null, 2)
})

editor.onSelectionChange((sel: BlockSelection | null) => {
  selectionOutput.textContent = sel === null ? 'null' : JSON.stringify(sel, null, 2)
})
