<script lang="ts">
  import { Blocks, Block }            from '../blocks/blocks'
  import { BlockEditorWithToolbar }   from '../editor/BlockEditorWithToolbar'
  import type { BlockSelection }      from '../editor/BlockEditor'
  import ResizableLayout              from './components/resizable-layout.svelte'
  import JsonPanel                    from './components/json-panel.svelte'

  const STORAGE_KEY = 'block-editor-demo-state'

  function loadFromStorage(): Blocks | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? Blocks.from(JSON.parse(raw)) : null
    } catch { return null }
  }

  const initialBlocks = loadFromStorage() ?? Blocks.from([
    new Block('b1', { text: 'Hello world!', inline: [{ type: 'Bold', start: 0, end: 5 }] }, [
      new Block('b2', { text: 'Nested block', inline: [] }, []),
    ]),
  ])

  let selection = $state<BlockSelection | null>(null)
  let blocks    = $state(initialBlocks.blocks)

  function mountEditor(node: HTMLElement) {
    const editor = new BlockEditorWithToolbar(node, initialBlocks)

    editor.onChange((b) => {
      blocks = b.blocks
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b.blocks))
    })
    editor.onSelectionChange((sel) => { selection = sel })

    return () => editor.destroy()
  }
</script>

<ResizableLayout>
  {#snippet editor()}
    <div {@attach mountEditor}></div>
  {/snippet}

  {#snippet inspector()}
    <JsonPanel title="Selection" storageKey="inspector-selection" value={selection} />
    <JsonPanel title="State JSON" storageKey="inspector-state"    value={blocks} />
  {/snippet}
</ResizableLayout>
