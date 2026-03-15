<script lang="ts">
    import { Blocks, Block } from "$lib/block-editor";
    import { BlockEditorWithToolbar } from "$lib/block-editor";
    import type { BlockSelection } from "$lib/block-editor";
    import ResizableLayout from "../components/resizable-layout.svelte";
    import JsonPanel from "../components/json-panel.svelte";
    import ThemeToggle from "../components/theme-toggle.svelte";

    const STORAGE_KEY = "block-editor-demo-state";

    function loadFromStorage(): Blocks | null {
        if (typeof window === "undefined") return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? Blocks.from(JSON.parse(raw)) : null;
        } catch {
            return null;
        }
    }

    const initialBlocks =
        loadFromStorage() ??
        Blocks.from([
            new Block(
                "b1",
                {
                    text: "Hello world!",
                    inline: [{ type: "Bold", start: 0, end: 5 }],
                },
                [new Block("b2", { text: "Nested block", inline: [] }, [])],
            ),
        ]);

    let selection = $state<BlockSelection | null>(null);
    let blocks = $state(initialBlocks.blocks);

    function mountEditor(node: HTMLElement) {
        const editor = new BlockEditorWithToolbar(node, initialBlocks);

        editor.onChange((b) => {
            blocks = b.blocks;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(b.blocks));
        });
        editor.onSelectionChange((sel) => {
            selection = sel;
        });

        return () => editor.destroy();
    }
</script>

<ResizableLayout>
    {#snippet editor()}
        <div class="relative min-h-dvh">
            <div class="absolute top-4 right-4 z-10">
                <ThemeToggle />
            </div>
            <div class="max-w-2xl mx-auto px-6 pt-12 pb-8" {@attach mountEditor}></div>
        </div>
    {/snippet}

    {#snippet inspector()}
        <div class="px-3 py-2 border-b border-(--border)">
            <span class="text-[11px] font-semibold uppercase tracking-widest opacity-50">Inspector</span>
        </div>
        <div class="px-3 pb-3 flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
            <JsonPanel
                title="Selection"
                storageKey="inspector-selection"
                value={selection}
            />
            <JsonPanel
                title="State JSON"
                storageKey="inspector-state"
                value={blocks}
            />
        </div>
    {/snippet}
</ResizableLayout>
