import type { BlockId } from '../blocks/blocks'
import type { BlockEditorEventMap, BlockDataUpdatedEvent } from './events'
import { makeDebounced, type DebouncedFn } from './debounce'

export class BlockEventEmitter {
  #listeners: Map<keyof BlockEditorEventMap, Set<(payload: unknown) => void>> = new Map()
  #pending: Map<BlockId, DebouncedFn> = new Map()
  #getBlockData: (id: BlockId) => BlockDataUpdatedEvent | null
  #debounceMs: number
  #maxWaitMs: number

  constructor(
    getBlockData: (id: BlockId) => BlockDataUpdatedEvent | null,
    opts: { debounceMs: number; maxWaitMs: number },
  ) {
    this.#getBlockData = getBlockData
    this.#debounceMs = opts.debounceMs
    this.#maxWaitMs = opts.maxWaitMs
  }

  addEventListener<K extends keyof BlockEditorEventMap>(
    event: K,
    handler: (payload: BlockEditorEventMap[K]) => void,
  ): () => void {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set())
    }
    this.#listeners.get(event)!.add(handler as (payload: unknown) => void)
    return () => this.#listeners.get(event)?.delete(handler as (payload: unknown) => void)
  }

  emit<K extends keyof BlockEditorEventMap>(event: K, payload: BlockEditorEventMap[K]): void {
    const listeners = this.#listeners.get(event)
    if (!listeners) return
    for (const cb of listeners) cb(payload as unknown)
  }

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

  flushDataUpdated(id: BlockId): void {
    const fn = this.#pending.get(id)
    if (fn) fn.flush()
  }

  cancelDataUpdated(id: BlockId): void {
    const fn = this.#pending.get(id)
    if (fn) {
      fn.cancel()
      this.#pending.delete(id)
    }
  }

  flushAll(): void {
    for (const id of [...this.#pending.keys()]) {
      this.flushDataUpdated(id)
    }
  }

  cancelAll(): void {
    for (const fn of this.#pending.values()) fn.cancel()
    this.#pending.clear()
  }
}
