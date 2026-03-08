import { Text } from './text/text'
import { TextEditor } from './editor/TextEditor'

const initial = new Text('Hello world, this is a demo!', [
  { type: 'Bold',      start: 0,  end: 5  },
  { type: 'Italic',   start: 13, end: 17 },
  { type: 'Underline', start: 23, end: 27 },
])

const editor = new TextEditor(document.getElementById('editor-container')!, initial)

const jsonOutput = document.getElementById('json-output')!
jsonOutput.textContent = JSON.stringify(initial.toJSON(), null, 2)

editor.onChange((text) => {
  jsonOutput.textContent = JSON.stringify(text.toJSON(), null, 2)
})
