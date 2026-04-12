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

    let view: DailyNoteScrollView | null = $state(null)
    let showTodayBtn = $state(false)

    function mountScrollView(provider: NoteProvider, centerDate: string) {
        return (node: HTMLElement) => {
            view = new DailyNoteScrollView(node, provider, centerDate, {
                onVisibleDatesChange: (dates) => { showTodayBtn = !dates.includes(centerDate) },
            })
            return () => { view?.destroy(); view = null }
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

    <!-- Scroll affordance: bottom fade hints that more days exist -->
    <div class="fade-bottom" aria-hidden="true"></div>

    <!-- Jump-to-today button -->
    {#if showTodayBtn}
        <button class="today-btn" onclick={() => view?.scrollToToday()}>Today</button>
    {/if}
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
        /* Disable browser scroll anchoring so we control position correction
           manually in DailyNoteScrollView. Without this, prepending a section
           causes the browser to push scrollTop down automatically, keeping the
           old visual position instead of revealing the newly loaded day. */
        overflow-anchor: none;
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

    /* ── Scroll affordance: fade edges ──────────────────────────────────────── */

    .fade-bottom {
        position: absolute;
        left: 0;
        right: 0;
        pointer-events: none;
        z-index: 15;
        bottom: 0;
        height: 5rem;
        background: linear-gradient(to top, #f9f7f4 15%, transparent 100%);
    }

    :global([data-theme="dark"]) .fade-bottom {
        background: linear-gradient(to top, #1a1917 15%, transparent 100%);
    }

    /* ── Day sections ────────────────────────────────────────────────────────── */

    .scroller :global(.daily-note-section) {
        max-width: 660px;
        margin: 0 auto;
        padding: 0 2.5rem 4rem;
        min-height: 50vh;
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
        border-top: 1px solid #ddd6cc;
        padding-top: 2rem;
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-section + .daily-note-section) {
        border-top-color: #2e2c28;
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
        padding: 0.5rem 0 0.25rem;
        margin-bottom: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;

        /* Override library opacity */
        opacity: 1 !important;

        font-family: 'Lora', Georgia, serif;
        font-style: italic;
        font-size: 1rem;
        font-weight: 400;
        letter-spacing: 0.01em;
        color: #b0a090;
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-header) {
        background: #1a1917;
        color: #6a5f55;
    }

    /* ── Today section ───────────────────────────────────────────────────────── */

    .scroller :global(.daily-note-section[data-today="true"] .daily-note-header) {
        color: #8b6f5a;
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-section[data-today="true"] .daily-note-header) {
        color: #9a7f6a;
    }

    .scroller :global(.daily-note-today-badge) {
        display: inline-block;
        padding: 0.15em 0.6em 0.1em;
        font-family: 'Lora', Georgia, serif;
        font-style: normal;
        font-size: 0.7rem;
        font-weight: 500;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #8b6f5a;
        border: 1px solid #c9a48a;
        border-radius: 1em;
        line-height: 1;
    }

    :global([data-theme="dark"]) .scroller :global(.daily-note-today-badge) {
        color: #9a7f6a;
        border-color: #5a4535;
    }

    /* ── Content area ────────────────────────────────────────────────────────── */

    .scroller :global(.daily-note-content) {
        padding-top: 0.25rem;
        cursor: text;
    }

    /* ── Block editor typography ─────────────────────────────────────────────── */

    .scroller :global(.block-editor-editable) {
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0;
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

    /* ── Today button ────────────────────────────────────────────────────────── */

    .today-btn {
        position: absolute;
        bottom: 1.75rem;
        left: 50%;
        translate: -50% 0;
        z-index: 20;

        padding: 0.4em 1.1em 0.35em;
        font-family: 'Lora', Georgia, serif;
        font-style: italic;
        font-size: 0.875rem;
        font-weight: 400;
        letter-spacing: 0.02em;
        color: #8b6f5a;
        background: #f9f7f4;
        border: 1px solid #c9a48a;
        border-radius: 2em;
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);

        animation: today-btn-in 0.2s ease-out both;
    }

    @keyframes today-btn-in {
        from { opacity: 0; translate: -50% 6px; }
        to   { opacity: 1; translate: -50% 0; }
    }

    .today-btn:hover {
        background: #f3ede6;
        border-color: #b8886e;
    }

    :global([data-theme="dark"]) .today-btn {
        color: #9a7f6a;
        background: #1a1917;
        border-color: #5a4535;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    }

    :global([data-theme="dark"]) .today-btn:hover {
        background: #211f1c;
        border-color: #7a5a45;
    }
</style>
