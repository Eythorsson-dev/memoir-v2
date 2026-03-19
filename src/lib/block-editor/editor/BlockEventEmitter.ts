import type { BlockId } from '../blocks/blocks'
import type { BlockEditorEventDtoMap, BlockDataUpdatedEventDto } from './events'
import { makeDebounced, type DebouncedFn } from './debounce'

export class BlockEventEmitter {
  #listeners: Map<keyof BlockEditorEventDtoMap, Set<(payload: unknown) => void>> = new Map()
  #pending: Map<BlockId, DebouncedFn> = new Map()
  #getBlockData: (id: BlockId) => BlockDataUpdatedEventDto | null
  #debounceMs: number
  #maxWaitMs: number

  constructor(
    getBlockData: (id: BlockId) => BlockDataUpdatedEventDto | null,
    opts: { debounceMs: number; maxWaitMs: number },
  ) {
    this.#getBlockData = getBlockData
    this.#debounceMs = opts.debounceMs
    this.#maxWaitMs = opts.maxWaitMs
  }

  /**
   * Registers a typed event listener. Returns an unsubscribe function that
   * removes the listener when called.
   */
  addEventListener<K extends keyof BlockEditorEventDtoMap>(
    event: K,
    handler: (payload: BlockEditorEventDtoMap[K]) => void,
  ): () => void {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set())
    }
    this.#listeners.get(event)!.add(handler as (payload: unknown) => void)
    return () => this.#listeners.get(event)?.delete(handler as (payload: unknown) => void)
  }

  /** Fires all listeners for `event` immediately (synchronous, not debounced). */
  emit<K extends keyof BlockEditorEventDtoMap>(event: K, payload: BlockEditorEventDtoMap[K]): void {
    const listeners = this.#listeners.get(event)
    if (!listeners) return
    for (const cb of listeners) cb(payload as unknown)
  }

  /**
   * Schedules a `blockDataUpdated` event for `id` after a debounce delay.
   * Cancels any previously pending call for the same `id` and restarts the timer.
   * The event is guaranteed to fire within `maxWaitMs` even if calls keep arriving.
   */
  scheduleDataUpdated(id: BlockId): void {
    if (!this.#pending.has(id)) {
      this.#pending.set(id, makeDebounced(
        () => this.#emitDataUpdated(id),
        this.#debounceMs,
        this.#maxWaitMs,
      ))
    }
    this.#pending.get(id)!()
  }

  #emitDataUpdated(id: BlockId): void {
    this.#pending.delete(id)
    const data = this.#getBlockData(id)
    if (data) this.emit('blockDataUpdated', data)
  }

  /** Immediately fires the pending `blockDataUpdated` event for `id`, if any. */
  flushDataUpdated(id: BlockId): void {
    const fn = this.#pending.get(id)
    if (fn) fn.flush()
  }

  /** Cancels the pending `blockDataUpdated` event for `id` without firing it. */
  cancelDataUpdated(id: BlockId): void {
    const fn = this.#pending.get(id)
    if (fn) {
      fn.cancel()
      this.#pending.delete(id)
    }
  }

  /** Immediately fires all pending `blockDataUpdated` events. */
  flushAll(): void {
    for (const id of [...this.#pending.keys()]) {
      this.flushDataUpdated(id)
    }
  }

  /** Cancels all pending `blockDataUpdated` events without firing them. */
  cancelAll(): void {
    for (const fn of this.#pending.values()) fn.cancel()
    this.#pending.clear()
  }
}
