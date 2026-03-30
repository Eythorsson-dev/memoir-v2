<script lang="ts">
  import { untrack } from 'svelte'
  import { BlockEditor, BLOCK_EDITOR_EVENT_NAMES } from '$lib/block-editor'
  import type { Blocks, BlockEditorOptions, BlockEditorEventDtoMap, BlockSelection, HighlightColor, HeaderLevel, InlineTypes } from '$lib/block-editor'
  import Button from './button.svelte'
  import ToggleButton from './toggle-button.svelte'
  import HeadingPicker from './heading-picker.svelte'
  import HighlightSplitButton from './highlight-split-button.svelte'
  import { Bold, Italic, Underline, Undo2, Redo2, ListIndentIncrease, ListIndentDecrease, ListOrdered, List } from '@lucide/svelte'

  export type BlockEditorChangeEvent = {
    [K in Exclude<keyof BlockEditorEventDtoMap, 'selectionChange'>]: {
      name: K
      payload: BlockEditorEventDtoMap[K]
      blocks: Blocks
    }
  }[Exclude<keyof BlockEditorEventDtoMap, 'selectionChange'>]

  const DATA_EVENTS = BLOCK_EDITOR_EVENT_NAMES.filter(
    (n): n is Exclude<typeof n, 'selectionChange'> => n !== 'selectionChange',
  )

  const DEFAULT_HIGHLIGHT: HighlightColor = 'amber'
  const DEFAULT_STORAGE_KEY = 'previous-highlight'

  let {
    initial,
    opts = {},
    onselectionchange,
    onchange,
  }: {
    initial?: Blocks
    opts?: BlockEditorOptions
    onselectionchange?: (sel: BlockSelection | null) => void
    onchange?: (event: BlockEditorChangeEvent) => void
  } = $props()

  const storageKey = untrack(() => opts.highlightStorageKey ?? DEFAULT_STORAGE_KEY)

  function loadLastUsed(): HighlightColor {
    if (typeof window === 'undefined') return DEFAULT_HIGHLIGHT
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return DEFAULT_HIGHLIGHT
      const parsed = JSON.parse(raw) as { color: HighlightColor }
      if (typeof parsed.color === 'string') return parsed.color
    } catch {
      // malformed — fall through to default
    }
    return DEFAULT_HIGHLIGHT
  }

  function saveLastUsed(color: HighlightColor): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ color }))
    } catch {
      // storage may be unavailable (e.g. private browsing with strict settings)
    }
  }

  let editor = $state<BlockEditor | null>(null)
  let canUndo = $state(false)
  let canRedo = $state(false)
  let activeInlines = $state(new Set<InlineTypes>())
  let activeHighlightColor = $state<HighlightColor | null>(null)
  let activeHeadingLevel = $state<HeaderLevel | null>(null)
  let activeBlockType = $state<'ordered-list' | 'unordered-list' | null>(null)
  let lastUsedHighlight = $state<HighlightColor>(loadLastUsed())

  function updateToolbarState(ed: BlockEditor): void {
    activeInlines = new Set(
      (['Bold', 'Italic', 'Underline', 'Highlight'] as const).filter((t) => ed.isInlineActive(t)),
    )
    activeHighlightColor = ed.getActiveInline('Highlight')?.color ?? null
    activeHeadingLevel = ed.getActiveHeaderLevel()
    activeBlockType = ed.isBlockTypeActive('ordered-list')
      ? 'ordered-list'
      : ed.isBlockTypeActive('unordered-list')
        ? 'unordered-list'
        : null
    canUndo = ed.canUndo()
    canRedo = ed.canRedo()
  }

  function mountEditor(node: HTMLElement) {
    const ed = new BlockEditor(node, initial, opts)
    editor = ed

    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        if (ed.isInlineActive('Highlight')) {
          ed.removeInlineFromSelection('Highlight')
        } else {
          ed.toggleInline('Highlight', { color: lastUsedHighlight })
          saveLastUsed(lastUsedHighlight)
        }
      }
    }
    node.addEventListener('keydown', keyHandler)

    const unsubSel = ed.addEventListener('selectionChange', (sel) => {
      onselectionchange?.(sel)
      updateToolbarState(ed)
    })

    const unsubData = DATA_EVENTS.map((name) =>
      ed.addEventListener(name, (payload) => {
        onchange?.({ name, payload, blocks: ed.getValue() } as BlockEditorChangeEvent)
        updateToolbarState(ed)
      }),
    )

    updateToolbarState(ed)

    return () => {
      node.removeEventListener('keydown', keyHandler)
      unsubSel()
      unsubData.forEach((u) => u())
      ed.destroy()
      editor = null
    }
  }

  function handleHighlightMainClick(): void {
    if (!editor) return
    if (editor.isInlineActive('Highlight')) {
      editor.removeInlineFromSelection('Highlight')
    } else {
      editor.toggleInline('Highlight', { color: lastUsedHighlight })
      saveLastUsed(lastUsedHighlight)
    }
  }

  function handleHighlightColor(color: HighlightColor): void {
    if (!editor) return
    editor.toggleInline('Highlight', { color })
    lastUsedHighlight = color
    saveLastUsed(color)
  }
</script>

<div role="toolbar" aria-label="Text formatting" class="toolbar">
  <Button
    label="Undo"
    shortcut={{ ctrl: true, key: 'Z' }}
    disabled={!canUndo}
    onclick={() => {
      editor?.undo()
      if (editor) updateToolbarState(editor)
    }}
  >
    <Undo2 size={16} />
  </Button>

  <Button
    label="Redo"
    shortcut={{ ctrl: true, shift: true, key: 'Z' }}
    disabled={!canRedo}
    onclick={() => {
      editor?.redo()
      if (editor) updateToolbarState(editor)
    }}
  >
    <Redo2 size={16} />
  </Button>

  <div class="separator" aria-hidden="true"></div>

  <HeadingPicker activeLevel={activeHeadingLevel} onselect={(level) => editor?.convertToHeader(level)} />

  <div class="separator" aria-hidden="true"></div>

  <ToggleButton
    label="Bold"
    shortcut={{ ctrl: true, key: 'B' }}
    pressed={activeInlines.has('Bold')}
    onclick={() => editor?.toggleInline('Bold')}
  >
    <Bold size={16} />
  </ToggleButton>

  <ToggleButton
    label="Italic"
    shortcut={{ ctrl: true, key: 'I' }}
    pressed={activeInlines.has('Italic')}
    onclick={() => editor?.toggleInline('Italic')}
  >
    <Italic size={16} />
  </ToggleButton>

  <ToggleButton
    label="Underline"
    shortcut={{ ctrl: true, key: 'U' }}
    pressed={activeInlines.has('Underline')}
    onclick={() => editor?.toggleInline('Underline')}
  >
    <Underline size={16} />
  </ToggleButton>

  <HighlightSplitButton
    active={activeInlines.has('Highlight')}
    activeColor={activeHighlightColor}
    lastUsed={lastUsedHighlight}
    onmainclick={handleHighlightMainClick}
    onhighlight={handleHighlightColor}
    onremove={() => editor?.removeInlineFromSelection('Highlight')}
  />

  <div class="separator" aria-hidden="true"></div>

  <Button label="Indent" shortcut={{ key: 'Tab' }} onclick={() => editor?.indent()}>
    <ListIndentIncrease size={16} />
  </Button>

  <Button label="Outdent" shortcut={{ shift: true, key: 'Tab' }} onclick={() => editor?.outdent()}>
    <ListIndentDecrease size={16} />
  </Button>

  <div class="separator" aria-hidden="true"></div>

  <ToggleButton
    label="Ordered list"
    pressed={activeBlockType === 'ordered-list'}
    onclick={() => editor?.convertBlockType(activeBlockType === 'ordered-list' ? 'text' : 'ordered-list')}
  >
    <ListOrdered size={16} />
  </ToggleButton>

  <ToggleButton
    label="Unordered list"
    pressed={activeBlockType === 'unordered-list'}
    onclick={() => editor?.convertBlockType(activeBlockType === 'unordered-list' ? 'text' : 'unordered-list')}
  >
    <List size={16} />
  </ToggleButton>
</div>

<div {@attach mountEditor}></div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 6px;
  }

  .separator {
    width: 1px;
    height: 16px;
    background: var(--toolbar-separator-color, currentColor);
    opacity: 0.2;
    margin: 0 4px;
    flex-shrink: 0;
  }
</style>
