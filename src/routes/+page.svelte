<script lang="ts">
    import { Blocks, Block } from "$lib/block-editor";
    import { BlockEditorWithToolbar } from "$lib/block-editor";
    import type { BlockSelection } from "$lib/block-editor";
    import ResizableLayout from "../components/resizable-layout.svelte";
    import CodePreview from "../components/code-preview.svelte";
    import ThemeToggle from "../components/theme-toggle.svelte";
    import EventLogPanel from "../components/event-log-panel.svelte";
    import type { LogEntry } from "../components/event-log-panel.svelte";

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
    let log = $state<LogEntry[]>([]);

    function mountEditor(node: HTMLElement) {
        const editor = new BlockEditorWithToolbar(node, initialBlocks);

        editor.addEventListener("selectionChange", (sel) => {
            selection = sel;
        });

        const stateEvents = [
            "blockCreated",
            "blockDataUpdated",
            "blockRemoved",
            "blockMoved",
        ] as const;

        for (const name of stateEvents) {
            editor.addEventListener(name, (payload) => {
                blocks = editor.getValue().blocks;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
                const time = new Date().toTimeString().slice(0, 8);
                log = [{ time, name, payload: JSON.stringify(payload) }, ...log].slice(0, 50);
            });
        }

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
            <EventLogPanel
                title="Event Log"
                storageKey="inspector-event-log"
                bind:entries={log}
            />
            <CodePreview
                title="Selection"
                storageKey="inspector-selection"
                language="json"
                code={JSON.stringify(selection, null, 2)}
            />
            <CodePreview
                title="State JSON"
                storageKey="inspector-state"
                language="json"
                code={JSON.stringify(blocks, null, 2)}
            />
        </div>
    {/snippet}
</ResizableLayout>
