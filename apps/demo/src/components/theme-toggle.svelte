<script lang="ts">
  import { Sun, Moon } from '@lucide/svelte';
  import { onMount } from 'svelte';

  let isDark = $state(false);

  onMount(() => {
    isDark = document.documentElement.dataset.theme === 'dark';
  });

  function toggle() {
    isDark = !isDark;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }
</script>

<button
  onclick={toggle}
  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
  class="size-8 flex items-center justify-center rounded-md border border-transparent text-(--toolbar-fg) cursor-pointer hover:bg-(--toolbar-btn-hover-bg) transition-colors duration-150 [&>svg]:size-4 [&>svg]:pointer-events-none"
>
  {#if isDark}
    <Sun />
  {:else}
    <Moon />
  {/if}
</button>
