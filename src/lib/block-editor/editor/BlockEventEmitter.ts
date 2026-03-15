import type { BlockId } from '../blocks/blocks'
import type { BlockEditorEventMap, BlockDataUpdatedEvent } from './events'
import { makeDebounced, type DebouncedFn } from './debounce'

export class BlockEventEmitter {
  private _listeners: Map<keyof BlockEditorEventMap, Set<(payload: unknown) => void>> = new Map()
  private _pending: Map<BlockId, DebouncedFn> = new Map()
  private _getBlockData: (id: BlockId) => BlockDataUpdatedEvent | null
  private _debounceMs: number
  private _maxWaitMs: number

  constructor(
    getBlockData: (id: BlockId) => BlockDataUpdatedEvent | null,
    opts: { debounceMs: number; maxWaitMs: number },
  ) {
    this._getBlockData = getBlockData
    this._debounceMs = opts.debounceMs
    this._maxWaitMs = opts.maxWaitMs
  }

  addEventListener<K extends keyof BlockEditorEventMap>(
    event: K,
    handler: (payload: BlockEditorEventMap[K]) => void,
  ): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(handler as (payload: unknown) => void)
    return () => this._listeners.get(event)?.delete(handler as (payload: unknown) => void)
  }

  emit<K extends keyof BlockEditorEventMap>(event: K, payload: BlockEditorEventMap[K]): void {
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const cb of listeners) cb(payload as unknown)
  }

  scheduleDataUpdated(id: BlockId): void {
    if (!this._pending.has(id)) {
      this._pending.set(id, makeDebounced(
        () => this._emitDataUpdated(id),
        this._debounceMs,
        this._maxWaitMs,
      ))
    }
    this._pending.get(id)!()
  }

  private _emitDataUpdated(id: BlockId): void {
    this._pending.delete(id)
    const data = this._getBlockData(id)
    if (data) this.emit('blockDataUpdated', data)
  }

  flushDataUpdated(id: BlockId): void {
    const fn = this._pending.get(id)
    if (fn) fn.flush()
  }

  cancelDataUpdated(id: BlockId): void {
    const fn = this._pending.get(id)
    if (fn) {
      fn.cancel()
      this._pending.delete(id)
    }
  }

  flushAll(): void {
    for (const id of [...this._pending.keys()]) {
      this.flushDataUpdated(id)
    }
  }

  cancelAll(): void {
    for (const fn of this._pending.values()) fn.cancel()
    this._pending.clear()
  }
}
