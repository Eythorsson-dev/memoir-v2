<script lang="ts">
  import { onMount, untrack } from "svelte";

  let {
    storageKey = "inspector-width",
    minWidth = 200,
    maxWidth = 600,
    defaultWidth = 320,
    editor,
    inspector,
  }: {
    storageKey?: string;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    editor: import("svelte").Snippet;
    inspector: import("svelte").Snippet;
  } = $props();

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  let width = $state(untrack(() => defaultWidth));

  onMount(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) width = parseInt(stored) || defaultWidth;
  });

  let handleEl: HTMLElement;

  function onPointerDown(e: PointerEvent) {
    handleEl.setPointerCapture(e.pointerId);
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function onMove(e: PointerEvent) {
      width = clamp(startWidth + (startX - e.clientX), minWidth, maxWidth);
    }
    function onUp() {
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.releasePointerCapture(e.pointerId);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem(storageKey, String(width));
    }
    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp, { once: true });
  }

  function onKeyDown(e: KeyboardEvent) {
    const STEP = 16;
    const delta: Record<string, number> = {
      ArrowLeft: STEP,
      ArrowRight: -STEP,
      Home: -(width - minWidth),
      End: maxWidth - width,
    };
    if (!(e.key in delta)) return;
    e.preventDefault();
    width = clamp(width + delta[e.key]!, minWidth, maxWidth);
    localStorage.setItem(storageKey, String(width));
  }
</script>

<div class="flex items-stretch min-h-dvh">
  <div class="flex-1 min-w-0">
    {@render editor()}
  </div>

  <div class="flex items-stretch sticky top-0 h-dvh shrink-0">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="box-border cursor-col-resize shrink-0 bg-transparent border-l-2 border-(--border) transition-colors duration-150 touch-none relative hover:border-(--toolbar-btn-active-border) focus-visible:border-(--toolbar-btn-active-border) focus-visible:outline-none active:border-(--toolbar-btn-active-border)"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabindex="0"
      bind:this={handleEl}
      onpointerdown={onPointerDown}
      onkeydown={onKeyDown}
    ></div>
    <div class="shrink-0 flex flex-col overflow-hidden bg-(--panel-bg)" style="width: {width}px">
      {@render inspector()}
    </div>
  </div>
</div>
