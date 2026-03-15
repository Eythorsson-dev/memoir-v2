<script lang="ts">
  import { untrack } from 'svelte'
  import Prism from 'prismjs'
  import 'prismjs/components/prism-json'
  import CollapsibleSection from './collapsible-section.svelte'

  const SUPPORTED_LANGUAGES = ['json'] as const
  type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

  let {
    title,
    storageKey,
    language,
    code,
  }: {
    title:       string
    storageKey?: string
    language:    SupportedLanguage
    code:        string
  } = $props()

  untrack(() => {
    if (!Prism.languages[language]) {
      throw new Error(`CodePreview: unsupported Prism language "${language}". Import its grammar first.`)
    }
  })

  let preEl = $state<HTMLElement | null>(null)

  $effect(() => {
    if (!preEl) return
    preEl.innerHTML = Prism.highlight(code, Prism.languages[language]!, language)
  })
</script>

<CollapsibleSection {title} {storageKey}>
  <pre
    bind:this={preEl}
    class="m-0 bg-(--panel-bg) text-(--fg) text-sm border border-(--border) p-4 rounded whitespace-break-spaces overflow-auto"
  ></pre>
</CollapsibleSection>

<style>
  :global(:root) {
    --json-property:    #7c3aed;
    --json-string:      #15803d;
    --json-number:      #b45309;
    --json-boolean:     #1d4ed8;
    --json-null:        #6b7280;
    --json-punctuation: #555;
  }
  :global([data-theme="dark"]) {
    --json-property:    #c084fc;
    --json-string:      #4ade80;
    --json-number:      #fbbf24;
    --json-boolean:     #93c5fd;
    --json-null:        #9ca3af;
    --json-punctuation: #aaa;
  }
  :global(.token.property)    { color: var(--json-property); }
  :global(.token.string)      { color: var(--json-string); }
  :global(.token.number)      { color: var(--json-number); }
  :global(.token.boolean)     { color: var(--json-boolean); }
  :global(.token.keyword),
  :global(.token.null)        { color: var(--json-null); }
  :global(.token.punctuation) { color: var(--json-punctuation); }
</style>
