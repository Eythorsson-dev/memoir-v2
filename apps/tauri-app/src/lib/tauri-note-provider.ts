import { invoke } from '@tauri-apps/api/core'
import type { NoteProvider } from '@memoir/block-editor'
import type { AnyBlock } from '@memoir/block-editor'

/**
 * `NoteProvider` backed by Tauri IPC commands.
 *
 * @remarks
 * `load` calls `get_or_create_daily_note` so a row is always returned — the
 * note is created with empty content on first access. This matches the
 * requirement that daily notes are non-deletable and always exist for any
 * date that has been opened.
 */
export class TauriNoteProvider implements NoteProvider {
  async load(date: string): Promise<ReadonlyArray<AnyBlock> | null> {
    const note = await invoke<{ id: string; content: string; updated_at: string }>(
      'get_or_create_daily_note',
      { date },
    )
    const parsed: unknown = JSON.parse(note.content)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed as AnyBlock[]
  }

  async save(date: string, blocks: ReadonlyArray<AnyBlock>): Promise<void> {
    await invoke('save_note', { id: date, content: JSON.stringify(blocks) })
  }
}
