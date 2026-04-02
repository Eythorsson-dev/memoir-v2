use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct NoteDto {
    pub id: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct NoteMetadataDto {
    pub id: String,
    pub updated_at: String,
}

/// Initialize the database, creating tables if they don't exist
pub fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id         TEXT PRIMARY KEY,
            content    TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );"
    )?;
    Ok(())
}

/// Upsert a note — insert or update content and timestamp
pub fn save_note(conn: &Connection, id: &str, content: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (id, content, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET content = ?2, updated_at = ?3",
        rusqlite::params![id, content, now],
    )?;
    Ok(())
}

/// Load a note by id, returning None if not found
pub fn load_note(conn: &Connection, id: &str) -> rusqlite::Result<Option<NoteDto>> {
    let mut stmt = conn.prepare("SELECT id, content, updated_at FROM notes WHERE id = ?1")?;
    let mut rows = stmt.query_map(rusqlite::params![id], |row| {
        Ok(NoteDto {
            id: row.get(0)?,
            content: row.get(1)?,
            updated_at: row.get(2)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// Return the note for `date` (ISO YYYY-MM-DD), creating an empty one if absent.
///
/// The note `id` is the ISO date string. Content is initialised to `"[]"` (an
/// empty block array) so callers always receive a valid, parseable note.
/// Idempotent — calling twice for the same date returns the same row.
pub fn get_or_create_daily_note(conn: &Connection, date: &str) -> rusqlite::Result<NoteDto> {
    if let Some(note) = load_note(conn, date)? {
        return Ok(note);
    }
    save_note(conn, date, "[]")?;
    load_note(conn, date).map(|opt| opt.expect("note must exist after save"))
}

/// List all notes, returning metadata only (no content)
pub fn list_notes(conn: &Connection) -> rusqlite::Result<Vec<NoteMetadataDto>> {
    let mut stmt = conn.prepare("SELECT id, updated_at FROM notes ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(NoteMetadataDto {
            id: row.get(0)?,
            updated_at: row.get(1)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_db_creates_notes_table() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        // Verify the notes table exists with the expected columns
        conn.prepare("SELECT id, content, updated_at FROM notes LIMIT 0")
            .expect("notes table should exist with id, content, updated_at columns");
    }

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn
    }

    #[test]
    fn save_and_load_round_trip() {
        let conn = test_conn();
        let content = r#"[{"type":"text","data":{"text":"hello"}}]"#;

        save_note(&conn, "note-1", content).unwrap();
        let note = load_note(&conn, "note-1").unwrap().expect("note should exist");

        assert_eq!(note.id, "note-1");
        assert_eq!(note.content, content);
        assert!(!note.updated_at.is_empty(), "updated_at should be set");
    }

    #[test]
    fn save_upserts_on_conflict() {
        let conn = test_conn();

        save_note(&conn, "note-1", "v1").unwrap();
        let first = load_note(&conn, "note-1").unwrap().unwrap();

        // Small delay so timestamp differs
        std::thread::sleep(std::time::Duration::from_millis(10));

        save_note(&conn, "note-1", "v2").unwrap();
        let second = load_note(&conn, "note-1").unwrap().unwrap();

        assert_eq!(second.content, "v2", "content should be updated");
        assert!(
            second.updated_at >= first.updated_at,
            "updated_at should advance"
        );

        // Should still be only one row
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn list_notes_returns_metadata() {
        let conn = test_conn();
        save_note(&conn, "note-a", r#"{"a":1}"#).unwrap();
        save_note(&conn, "note-b", r#"{"b":2}"#).unwrap();

        let notes = list_notes(&conn).unwrap();
        assert_eq!(notes.len(), 2);

        let ids: Vec<&str> = notes.iter().map(|n| n.id.as_str()).collect();
        assert!(ids.contains(&"note-a"));
        assert!(ids.contains(&"note-b"));

        // Metadata should have updated_at but no content
        for note in &notes {
            assert!(!note.updated_at.is_empty());
        }
    }

    #[test]
    fn list_notes_empty_db() {
        let conn = test_conn();
        let notes = list_notes(&conn).unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn load_missing_note_returns_none() {
        let conn = test_conn();
        let result = load_note(&conn, "does-not-exist").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_or_create_creates_note_when_absent() {
        let conn = test_conn();
        let note = get_or_create_daily_note(&conn, "2024-01-15").unwrap();
        assert_eq!(note.id, "2024-01-15");
        assert_eq!(note.content, "[]");
        assert!(!note.updated_at.is_empty());
    }

    #[test]
    fn get_or_create_returns_existing_note() {
        let conn = test_conn();
        save_note(&conn, "2024-01-15", r#"[{"blockType":"text"}]"#).unwrap();
        let note = get_or_create_daily_note(&conn, "2024-01-15").unwrap();
        assert_eq!(note.content, r#"[{"blockType":"text"}]"#);
    }

    #[test]
    fn get_or_create_is_idempotent() {
        let conn = test_conn();
        let first = get_or_create_daily_note(&conn, "2024-01-15").unwrap();
        let second = get_or_create_daily_note(&conn, "2024-01-15").unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(first.content, second.content);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
