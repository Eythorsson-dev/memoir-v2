<script lang="ts">
	import { DailyNoteEditor } from '@memoir/block-editor'
	import type { NoteProvider } from '@memoir/block-editor'

	let { provider, date }: { provider: NoteProvider; date: string } = $props()

	function mountEditor(provider: NoteProvider, date: string) {
		return (node: HTMLElement) => {
			const editor = new DailyNoteEditor(node, provider, date)
			return () => editor.destroy()
		}
	}
</script>

<div {@attach mountEditor(provider, date)}></div>
