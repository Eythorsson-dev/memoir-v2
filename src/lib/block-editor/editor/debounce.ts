export interface DebouncedFn {
  (): void
  cancel(): void
  flush(): void
}

export function makeDebounced(fn: () => void, delay: number, maxWait: number): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let pending = false

  function invoke(): void {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (maxTimer !== null) { clearTimeout(maxTimer); maxTimer = null }
    pending = false
    fn()
  }

  const debounced = Object.assign(
    function debouncedFn(): void {
      pending = true
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(invoke, delay)
      if (maxTimer === null) {
        maxTimer = setTimeout(invoke, maxWait)
      }
    },
    {
      cancel(): void {
        if (timer !== null) { clearTimeout(timer); timer = null }
        if (maxTimer !== null) { clearTimeout(maxTimer); maxTimer = null }
        pending = false
      },
      flush(): void {
        if (pending) invoke()
      },
    },
  )

  return debounced
}
