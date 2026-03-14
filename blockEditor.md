lets update the demo html page to render and parse blocks
i want to allow the user to press enter to split blocks, delete to merge blocks and use selection ranges to select multiple blocks

When the user creates a selection range, they can:
- press enter. This will delete the selected text
- press backspace or delete. This will delete the selection and merge the start and end blocks
- press any character. replace the selection with the character entered, and merge the blocks
