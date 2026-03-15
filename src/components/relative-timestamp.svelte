<script lang="ts">
  interface Props {
    value?: number | Date
  }

  let { value } = $props()

  let now = $state(Date.now())

  let timestamp = $derived.by(() => {
    if (value == null) return 0
    return typeof value === 'number' ? value : value.getTime()
  })

  let intervalMs = $derived.by(() => {
    const diffS = Math.floor((now - timestamp) / 1000)
    if (diffS < 60)     return 1_000
    if (diffS < 3_600)  return 30_000
    if (diffS < 86_400) return 300_000
    return 3_600_000
  })

  let relative = $derived.by(() => {
    const diffS = Math.floor((now - timestamp) / 1000)
    if (diffS < 5)      return 'just now'
    if (diffS < 60)     return `${diffS}s ago`
    const diffM = Math.floor(diffS / 60)
    if (diffM < 60)     return `${diffM}m ago`
    const diffH = Math.floor(diffM / 60)
    if (diffH < 24)     return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7)      return `${diffD}d ago`
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })

  let absolute = $derived(
    new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  )

  $effect(() => {
    const id = setInterval(() => { now = Date.now() }, intervalMs)
    return () => clearInterval(id)
  })
</script>

<time datetime={new Date(timestamp).toISOString()} title={absolute} class="cursor-help">{relative}</time>
