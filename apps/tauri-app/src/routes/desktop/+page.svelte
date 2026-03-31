<script lang="ts">
	import { BlockEditorWithToolbar, type BlockEditorChangeEvent } from '@memoir/block-editor-svelte'
	import { Blocks } from '@memoir/block-editor'
	import { invoke } from '@tauri-apps/api/core'

	const NOTE_ID = 'default'

	let initial: Blocks | undefined = $state(undefined)
	let loaded = $state(false)

	async function loadNote() {
		const note = await invoke<{ id: string; content: string; updated_at: string } | null>(
			'load_note',
			{ id: NOTE_ID }
		)
		if (note) {
			const dtos = JSON.parse(note.content)
			initial = Blocks.from(dtos)
		}
		loaded = true
	}

	function handleChange(event: BlockEditorChangeEvent) {
		const content = JSON.stringify(event.blocks)
		invoke('save_note', { id: NOTE_ID, content })
	}

	loadNote()
</script>

<div class="min-h-dvh">
	<div class="mx-auto max-w-3xl px-8 pt-12 pb-8">
		{#if loaded}
			<BlockEditorWithToolbar {initial} onchange={handleChange} />
		{/if}
	</div>
</div>
