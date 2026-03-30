<script lang="ts">
  import { Heading, ChevronDown } from '@lucide/svelte'
  import type { HeaderLevel } from '$lib/block-editor'
  import Dropdown from '../dropdown.svelte'
  import ToggleButton from '../toggle-button.svelte'

  const LEVELS = [1, 2, 3] as const satisfies ReadonlyArray<HeaderLevel>

  let {
    activeLevel = null,
    onselect,
  }: {
    activeLevel?: HeaderLevel | null
    onselect?: (level: HeaderLevel) => void
  } = $props()
</script>

<Dropdown>
  {#snippet trigger({ open, toggle })}
    <ToggleButton
      label="Heading"
      pressed={activeLevel !== null}
      class="h-7 px-1.5 gap-0.5 shrink-0"
      aria-haspopup="true"
      aria-expanded={open}
      onmousedown={(e) => { e.preventDefault(); toggle() }}
    >
      <Heading size={16} />
      <ChevronDown size={14} />
    </ToggleButton>
  {/snippet}

  {#snippet menu({ close })}
    <div
      class="
        bg-(--panel-bg) text-(--fg) border border-(--border) rounded-md
        p-1 flex flex-col gap-0.5 min-w-14
        shadow-[0_2px_4px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.18)]
      "
      role="dialog"
      aria-label="Heading level"
    >
      {#each LEVELS as level (level)}
        <ToggleButton
          label="Heading {level}"
          showTooltip={false}
          pressed={activeLevel === level}
          class="w-full h-7 text-xs font-semibold px-2"
          onmousedown={(e) => {
            e.preventDefault()
            close()
            onselect?.(level)
          }}
        >
          H{level}
        </ToggleButton>
      {/each}
    </div>
  {/snippet}
</Dropdown>
