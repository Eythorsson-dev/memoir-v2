/**
 * Svelte 5 universal-reactivity utility.
 * Creates a reactive value backed by localStorage.
 * SSR-safe: localStorage is never accessed on the server.
 * Values are JSON-serialised/deserialised.
 */
export function localState<T>(key: string, defaultValue: T): { value: T } {
  const stored =
    typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null

  let parsed: T = defaultValue
  if (stored !== null) {
    try {
      parsed = JSON.parse(stored)
    } catch {
      parsed = defaultValue
    }
  }

  let _value = $state<T>(parsed)

  return {
    get value() { return _value },
    set value(v: T) {
      _value = v
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(v))
      }
    },
  }
}
