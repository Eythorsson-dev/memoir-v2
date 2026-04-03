<script lang="ts">
    import { DailyNoteScrollView } from '@memoir/block-editor'
    import type { NoteProvider, AnyBlock } from '@memoir/block-editor'
    import ThemeToggle from '../../components/theme-toggle.svelte'

    class LocalStorageNoteProvider implements NoteProvider {
        async load(date: string): Promise<ReadonlyArray<AnyBlock> | null> {
            const json = localStorage.getItem(`memoir-note-${date}`)
            if (!json) return null
            try {
                return JSON.parse(json) as AnyBlock[]
            } catch {
                return null
            }
        }

        async save(date: string, blocks: ReadonlyArray<AnyBlock>): Promise<void> {
            localStorage.setItem(`memoir-note-${date}`, JSON.stringify(blocks))
        }
    }

    const provider = new LocalStorageNoteProvider()
    const today = new Date().toISOString().slice(0, 10)

    function mountScrollView(provider: NoteProvider, centerDate: string) {
        return (node: HTMLElement) => {
            const view = new DailyNoteScrollView(node, provider, centerDate)
            return () => view.destroy()
        }
    }
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />
</svelte:head>

<div class="shell">
    <div class="toggle-slot">
        <ThemeToggle />
    </div>

    <div class="scroller">
        <div {@attach mountScrollView(provider, today)}></div>
    </div>
</div>

<style>
    .shell {
        position: relative;
        height: 100dvh;
        background: #f9f7f4;
        overflow: hidden;
    }

    :global([data-theme="dark"]) .shell {
        background: #1a1917;
    }

    .toggle-slot {
        position: absolute;
        top: 1rem;
        right: 1.25rem;
        z-index: 30;
    }

    .scroller {
        height: 100%;
        overflow-y: auto;
        scroll-behavior: smooth;
    }

    .scroller::-webkit-scrollbar { width: 3px; }
    .scroller::-webkit-scrollbar-track { background: transparent; }
    .scroller::-webkit-scrollbar-thumb { background: #d8d2c8; border-radius: 2px; }

    :global([data-theme="dark"]) .scroller::-webkit-scrollbar-thumb { background: #2e2c28; }

    .scroller :global(.daily-note-section) {
        max-width: 660px;
        margin: 0 auto;
        padding: 0 2rem 6rem;
        min-height: 80vh;
    }

    .scroller :global(.daily-note-section + .daily-note-section) {
        border-top: 1px solid #ebe6df;
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-section + .daily-note-section) {
        border-top-color: #28261f;
    }

    .scroller :global(.daily-note-header) {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #f9f7f4;
        padding: 1.75rem 0 1.5rem;
        margin-bottom: 0.25rem;
        font-family: 'Lora', Georgia, serif;
        font-style: italic;
        font-size: 0.875rem;
        font-weight: 400;
        letter-spacing: 0.01em;
        /* Warm parchment tones — distinct from body text but easy to read */
        color: #8a7768;
        -webkit-mask-image: linear-gradient(to bottom, black 72%, transparent 100%);
        mask-image: linear-gradient(to bottom, black 72%, transparent 100%);
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-header) {
        background: #1a1917;
        color: #7a6e62;
    }

    .scroller :global(.daily-note-content) {
        padding-top: 0.5rem;
    }

    .scroller :global(.block-editor-editable) {
        min-height: 60vh;
        font-family: 'Lora', Georgia, serif;
        font-size: 1.0625rem;
        line-height: 1.9;
        color: #2d2820;
        caret-color: #a89f90;
        outline: none;
    }

    :global([data-theme="dark"]) .scroller :global(.block-editor-editable) {
        color: #e2dbd0;
        caret-color: #5c5447;
    }

    .scroller :global(.block-editor-editable .block > p) {
        padding-top: 0.15rem;
        padding-bottom: 0.15rem;
    }

    .scroller :global(.block-editor-editable .block[data-block-type="header"] > h1),
    .scroller :global(.block-editor-editable .block[data-block-type="header"] > h2),
    .scroller :global(.block-editor-editable .block[data-block-type="header"] > h3) {
        font-family: 'Lora', Georgia, serif;
        margin-top: 0.5rem;
    }
</style>
