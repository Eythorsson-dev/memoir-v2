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
    <link
        href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400;1,500&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<div class="shell">
    <!-- Subtle paper grain overlay -->
    <div class="grain" aria-hidden="true"></div>

    <div class="toggle-slot">
        <ThemeToggle />
    </div>

    <div class="scroller">
        <div {@attach mountScrollView(provider, today)}></div>
    </div>
</div>

<style>
    /* ── Shell ───────────────────────────────────────────────────────────────── */

    .shell {
        position: relative;
        height: 100dvh;
        background: #f9f7f4;
        overflow: hidden;
    }

    :global([data-theme="dark"]) .shell {
        background: #1a1917;
    }

    /* ── Grain texture — paper feel ──────────────────────────────────────────── */

    .grain {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 50;
        opacity: 0.03;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
        background-repeat: repeat;
        background-size: 200px 200px;
    }

    :global([data-theme="dark"]) .grain {
        opacity: 0.06;
    }

    /* ── Theme toggle ────────────────────────────────────────────────────────── */

    .toggle-slot {
        position: absolute;
        top: 1rem;
        right: 1.25rem;
        z-index: 30;
    }

    /* ── Scroll container ────────────────────────────────────────────────────── */

    .scroller {
        height: 100%;
        overflow-y: auto;
        scroll-behavior: smooth;
    }

    .scroller::-webkit-scrollbar {
        width: 3px;
    }
    .scroller::-webkit-scrollbar-track {
        background: transparent;
    }
    .scroller::-webkit-scrollbar-thumb {
        background: #d8d2c8;
        border-radius: 2px;
    }

    :global([data-theme="dark"]) .scroller::-webkit-scrollbar-thumb {
        background: #2e2c28;
    }

    /* ── Day sections ────────────────────────────────────────────────────────── */

    .scroller :global(.daily-note-section) {
        max-width: 660px;
        margin: 0 auto;
        padding: 0 2.5rem 8rem;
        min-height: 100vh;
        animation: section-appear 0.25s ease-out both;
    }

    @keyframes section-appear {
        from {
            opacity: 0;
            transform: translateY(6px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .scroller :global(.daily-note-section + .daily-note-section) {
        border-top: 1px solid #ebe5de;
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-section + .daily-note-section) {
        border-top-color: #252320;
    }

    /* ── Date header ─────────────────────────────────────────────────────────── */

    /*
     * The library's daily-note-editor.css sets opacity: 0.5 on .daily-note-header.
     * We override to 1 here so the date reads clearly, then use color alone
     * to achieve the right visual weight.
     */
    .scroller :global(.daily-note-header) {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #f9f7f4;
        padding: 2.25rem 0 1.5rem;
        margin-bottom: 0.25rem;

        /* Override library opacity */
        opacity: 1 !important;

        font-family: 'Lora', Georgia, serif;
        font-style: italic;
        font-size: 1rem;
        font-weight: 400;
        letter-spacing: 0.01em;
        color: #b0a090;

        /* Fade out gracefully at the bottom edge */
        -webkit-mask-image: linear-gradient(to bottom, black 75%, transparent 100%);
        mask-image: linear-gradient(to bottom, black 75%, transparent 100%);
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-header) {
        background: #1a1917;
        color: #6a5f55;
    }

    /* ── Content area ────────────────────────────────────────────────────────── */

    .scroller :global(.daily-note-content) {
        padding-top: 0.75rem;
        cursor: text;
    }

    /* ── Block editor typography ─────────────────────────────────────────────── */

    .scroller :global(.block-editor-editable) {
        font-family: 'Lora', Georgia, serif;
        font-size: 1.0625rem;
        line-height: 1.95;
        color: #2d2820;
        caret-color: #b8a898;
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

    /* ── Writing affordance: placeholder on empty sections ───────────────────── */
    /*
     * When a day section contains only one block and that block's <p>
     * holds just a <br> (i.e., the user hasn't typed anything yet),
     * show placeholder text so the area feels inviting and clearly writable.
     *
     * We use position: absolute so it doesn't shift the caret.
     */

    .scroller :global(.daily-note-content .block:only-child > p:has(> br:only-child)) {
        position: relative;
    }

    .scroller :global(.daily-note-content .block:only-child > p:has(> br:only-child))::before {
        content: 'Begin writing…';
        position: absolute;
        top: 2px;
        left: 4px; /* align with the 4px padding-left on <p> from block-editor.css */
        color: #c8bdb0;
        font-style: italic;
        pointer-events: none;
        user-select: none;
    }

    :global([data-theme="dark"])
        .scroller
        :global(.daily-note-content .block:only-child > p:has(> br:only-child))::before {
        color: #3d3830;
    }
</style>
