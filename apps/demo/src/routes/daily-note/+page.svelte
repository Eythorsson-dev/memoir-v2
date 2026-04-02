<script lang="ts">
    import { DailyNoteEditor } from '@memoir/block-editor'
    import type { NoteProvider, AnyBlock } from '@memoir/block-editor'
    import ThemeToggle from '../../components/theme-toggle.svelte'

    // In-memory NoteProvider — stores one note per date in a Map.
    class InMemoryNoteProvider implements NoteProvider {
        #store = new Map<string, ReadonlyArray<AnyBlock>>()

        async load(date: string): Promise<ReadonlyArray<AnyBlock> | null> {
            return this.#store.get(date) ?? null
        }

        async save(date: string, blocks: ReadonlyArray<AnyBlock>): Promise<void> {
            this.#store.set(date, blocks)
        }
    }

    const provider = new InMemoryNoteProvider()
    const today = new Date().toISOString().slice(0, 10)

    function mountEditor(provider: NoteProvider, date: string) {
        return (node: HTMLElement) => {
            const editor = new DailyNoteEditor(node, provider, date)
            return () => editor.destroy()
        }
    }
</script>

<div class="relative min-h-dvh">
    <div class="absolute top-4 right-4 z-10">
        <ThemeToggle />
    </div>
    <div class="max-w-2xl mx-auto px-6 pt-12 pb-8">
        <div {@attach mountEditor(provider, today)}></div>
    </div>
</div>
