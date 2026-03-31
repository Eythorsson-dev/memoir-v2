mod db;

use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

struct DbState(Mutex<Connection>);

#[tauri::command]
fn save_note(state: tauri::State<DbState>, id: String, content: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_note(&conn, &id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_note(state: tauri::State<DbState>, id: String) -> Result<Option<db::NoteDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::load_note(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_notes(state: tauri::State<DbState>) -> Result<Vec<db::NoteMetadataDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::list_notes(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("memoir.db");

            let conn = Connection::open(&db_path)
                .expect("failed to open database");
            db::init_db(&conn)
                .expect("failed to initialize database");

            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_note, load_note, list_notes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
