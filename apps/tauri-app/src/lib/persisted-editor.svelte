<script lang="ts">
	import { BlockEditorWithToolbar, type BlockEditorChangeEvent } from '@memoir/block-editor-svelte'
	import { Blocks } from '@memoir/block-editor'
	import { invoke } from '@tauri-apps/api/core'

	let { id }: { id: string } = $props()

	let initial: Blocks | undefined = $state(undefined)
	let loaded = $state(false)

	async function loadNote() {
		const note = await invoke<{ id: string; content: string; updated_at: string } | null>(
			'load_note',
			{ id }
		)
		if (note) {
			const dtos = JSON.parse(note.content)
			if (Array.isArray(dtos) && dtos.length > 0) {
				initial = Blocks.from(dtos)
			}
		}
		loaded = true
	}

	function handleChange(event: BlockEditorChangeEvent) {
		const content = JSON.stringify(event.blocks.blocks)
		invoke('save_note', { id, content })
	}

	loadNote()
</script>

{#if loaded}
	<BlockEditorWithToolbar {initial} onchange={handleChange} />
{/if}
