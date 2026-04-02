<script lang="ts">
	import DailyNote from '$lib/daily-note.svelte'
	import { TauriNoteProvider } from '$lib/tauri-note-provider'

	const provider = new TauriNoteProvider()
	const today = new Date().toISOString().slice(0, 10)
</script>

<div class="min-h-dvh">
	<div class="w-full px-4 pt-6 pb-4">
		<DailyNote {provider} date={today} />
	</div>
</div>
