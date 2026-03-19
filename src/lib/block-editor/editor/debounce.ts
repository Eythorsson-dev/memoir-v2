/**
 * A debounced function with `cancel` and `flush` controls.
 * - `cancel()` — drops the pending invocation without calling `fn`.
 * - `flush()` — calls `fn` immediately if an invocation is pending.
 */
export interface DebouncedFn {
  (): void
  cancel(): void
  flush(): void
}

/**
 * Returns a debounced wrapper around `fn`.
 *
 * Calls to the returned function are delayed by `delay` ms; the timer resets
 * on each call. `maxWait` is a hard cap: if calls keep arriving, `fn` will fire
 * at most `maxWait` ms after the first pending call regardless of the `delay`.
 */
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
