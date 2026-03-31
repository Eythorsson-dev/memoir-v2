<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'

	onMount(() => {
		goto('/desktop')
	})
</script>

<p>Loading…</p>
