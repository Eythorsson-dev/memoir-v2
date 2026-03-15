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
  <summary class="sticky top-0 bg-(--panel-bg) flex items-center gap-[0.4rem] cursor-pointer font-semibold py-[0.4rem] px-2 -mx-2 list-none select-none rounded transition-colors duration-120 hover:bg-(--toolbar-btn-hover-bg)">
    <span class={['[&>svg]:size-3.5 [&>svg]:stroke-current shrink-0 transition-transform duration-150', open && 'rotate-90'].filter(Boolean).join(' ')}>
      <ChevronRight />
    </span>
    {title}
  </summary>
  <div class="overflow-y-auto pt-2">
    {@render children()}
  </div>
</details>
