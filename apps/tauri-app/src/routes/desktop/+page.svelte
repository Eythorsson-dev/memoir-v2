<script lang="ts">
	import DailyNote from '$lib/daily-note.svelte'
	import { TauriNoteProvider } from '$lib/tauri-note-provider'

	const provider = new TauriNoteProvider()
	const today = new Date().toISOString().slice(0, 10)
</script>

<div class="min-h-dvh">
	<div class="mx-auto max-w-3xl px-8 pt-6 pb-8">
		<DailyNote {provider} date={today} />
	</div>
</div>
