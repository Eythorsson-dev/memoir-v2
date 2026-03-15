<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";

  let {
    title,
    storageKey = "",
    defaultOpen = true,
    children,
  }: {
    title: string;
    storageKey?: string;
    defaultOpen?: boolean;
    children: import("svelte").Snippet;
  } = $props();

  let open = $state(untrack(() => defaultOpen));

  function onToggle(e: Event) {
    open = (e.currentTarget as HTMLDetailsElement).open;
    if (storageKey) localStorage.setItem(storageKey, String(open));
  }

  onMount(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) open = stored === "true";
    }
  });
</script>

<details {open} ontoggle={onToggle}>
  <summary class="section-summary">
    <span class="section-icon">
      <ChevronRight></ChevronRight>
    </span>
    {title}
  </summary>
  <div class="section-body">
    {@render children()}
  </div>
</details>

<style>
  .section-summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-weight: 600;
    padding: 0.4rem 0.5rem;
    margin: 0 -0.5rem;
    list-style: none;
    user-select: none;
    border-radius: 4px;
    transition: background 120ms;
  }
  .section-summary:hover {
    background: var(--toolbar-btn-hover-bg);
  }
  .section-summary :global(.lucide) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: transform 150ms;
    stroke: currentColor;
  }
  details[open] > summary :global(.lucide) {
    transform: rotate(90deg);
  }
  .section-body {
    max-height: 300px;
    overflow-y: auto;
  }
</style>
