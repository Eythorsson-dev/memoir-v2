<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  let {
    title,
    open = $bindable(true),
    children,
  }: {
    title:    string
    open?:    boolean
    children: import("svelte").Snippet
  } = $props()

  function onToggle(e: Event) {
    open = (e.currentTarget as HTMLDetailsElement).open;
  }
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
