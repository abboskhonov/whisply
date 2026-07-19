use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::Duration;
use tauri::{AppHandle, State};

#[derive(Clone, Debug, Serialize)]
pub struct DictionaryEntry {
    pub id: i64,
    pub term: String,
    pub pronunciation: Option<String>,
    pub entry_type: String,
    pub note: Option<String>,
}

pub struct DictionaryStore {
    connection: Mutex<Connection>,
    entries: RwLock<Vec<DictionaryEntry>>,
    revision: AtomicU64,
}

impl DictionaryStore {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let connection =
            Connection::open(crate::history::database_path(app)?).map_err(|e| e.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        connection.execute_batch("CREATE TABLE IF NOT EXISTS dictionary_entries (id INTEGER PRIMARY KEY, term TEXT NOT NULL COLLATE NOCASE UNIQUE, pronunciation TEXT, entry_type TEXT NOT NULL DEFAULT 'other', note TEXT, created_at_ms INTEGER NOT NULL);").map_err(|e| e.to_string())?;
        let entries = load(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            entries: RwLock::new(entries),
            revision: AtomicU64::new(0),
        })
    }
    fn list(&self) -> Result<Vec<DictionaryEntry>, String> {
        self.entries
            .read()
            .map(|v| v.clone())
            .map_err(|e| e.to_string())
    }
    fn add(
        &self,
        term: String,
        pronunciation: Option<String>,
        entry_type: String,
        note: Option<String>,
    ) -> Result<DictionaryEntry, String> {
        let term = clean(term, "Term", 200)?;
        let pronunciation = clean_opt(pronunciation, 200);
        let note = clean_opt(note, 500);
        let entry_type = match entry_type.as_str() {
            "name" | "acronym" | "jargon" | "other" => entry_type,
            _ => "other".into(),
        };
        let conn = self.connection.lock().map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO dictionary_entries (term, pronunciation, entry_type, note, created_at_ms) VALUES (?1,?2,?3,?4,?5)", params![term, pronunciation, entry_type, note, crate::history::unix_timestamp_ms()?]).map_err(|e| format!("Could not save dictionary entry: {e}"))?;
        let entry = DictionaryEntry {
            id: conn.last_insert_rowid(),
            term,
            pronunciation,
            entry_type,
            note,
        };
        drop(conn);
        let mut all = self.entries.write().map_err(|e| e.to_string())?;
        all.push(entry.clone());
        all.sort_by_key(|e| e.term.to_lowercase());
        self.revision.fetch_add(1, Ordering::Relaxed);
        Ok(entry)
    }
    fn delete(&self, id: i64) -> Result<(), String> {
        let conn = self.connection.lock().map_err(|e| e.to_string())?;
        if conn
            .execute("DELETE FROM dictionary_entries WHERE id=?1", [id])
            .map_err(|e| e.to_string())?
            == 0
        {
            return Err("Dictionary entry no longer exists".into());
        }
        self.entries
            .write()
            .map_err(|e| e.to_string())?
            .retain(|e| e.id != id);
        self.revision.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    /// Returns the spoken forms in sherpa's comma-separated hotword format.
    pub fn hotwords(&self) -> (u64, String) {
        let values = self
            .entries
            .read()
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(|entry| {
                        let value = entry.pronunciation.as_deref().unwrap_or(&entry.term).trim();
                        if value.is_empty() || value.contains(',') || value.contains('\n') {
                            None
                        } else {
                            Some(value.to_string())
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        (self.revision.load(Ordering::Relaxed), values.join(","))
    }
    pub fn apply(&self, text: &str) -> String {
        let mut result = text.to_string();
        let mut entries = self.entries.read().map(|v| v.clone()).unwrap_or_default();
        entries.sort_by_key(|e| {
            std::cmp::Reverse(
                e.pronunciation
                    .as_ref()
                    .map(|p| p.chars().count())
                    .unwrap_or(e.term.chars().count()),
            )
        });
        for e in entries {
            let spoken = e.pronunciation.as_deref().unwrap_or(&e.term);
            result = replace_phrase(&result, spoken, &e.term);
        }
        result
    }
}

fn load(conn: &Connection) -> Result<Vec<DictionaryEntry>, String> {
    let mut s=conn.prepare("SELECT id,term,pronunciation,entry_type,note FROM dictionary_entries ORDER BY term COLLATE NOCASE").map_err(|e|e.to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok(DictionaryEntry {
                id: r.get(0)?,
                term: r.get(1)?,
                pronunciation: r.get(2)?,
                entry_type: r.get(3)?,
                note: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
fn clean(value: String, label: &str, max: usize) -> Result<String, String> {
    let v = value.trim().to_string();
    if v.is_empty() {
        Err(format!("{label} cannot be empty"))
    } else if v.chars().count() > max {
        Err(format!("{label} is too long"))
    } else {
        Ok(v)
    }
}
fn clean_opt(value: Option<String>, max: usize) -> Option<String> {
    value.and_then(|v| {
        let v = v.trim().to_string();
        if v.is_empty() || v.chars().count() > max {
            None
        } else {
            Some(v)
        }
    })
}
fn replace_phrase(text: &str, phrase: &str, replacement: &str) -> String {
    let p = phrase.trim();
    if p.is_empty() {
        return text.into();
    }
    let lower = text.to_lowercase();
    let target = p.to_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut pos = 0;
    while let Some(i) = lower[pos..].find(&target) {
        let start = pos + i;
        let end = start + target.len();
        let boundary = |c: Option<char>| c.map(|x| x.is_alphanumeric()).unwrap_or(false);
        if !boundary(text[..start].chars().last()) && !boundary(text[end..].chars().next()) {
            out.push_str(&text[pos..start]);
            out.push_str(replacement);
            pos = end;
        } else {
            out.push_str(&text[pos..end]);
            pos = end;
        }
    }
    out.push_str(&text[pos..]);
    out
}

#[tauri::command]
pub fn list_dictionary_entries(
    store: State<'_, DictionaryStore>,
) -> Result<Vec<DictionaryEntry>, String> {
    store.list()
}
#[tauri::command]
pub fn add_dictionary_entry(
    store: State<'_, DictionaryStore>,
    term: String,
    pronunciation: Option<String>,
    entry_type: String,
    note: Option<String>,
) -> Result<DictionaryEntry, String> {
    store.add(term, pronunciation, entry_type, note)
}
#[tauri::command]
pub fn delete_dictionary_entry(
    store: State<'_, DictionaryStore>,
    entry_id: i64,
) -> Result<(), String> {
    store.delete(entry_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> DictionaryStore {
        DictionaryStore {
            connection: Mutex::new(Connection::open_in_memory().unwrap()),
            entries: RwLock::new(Vec::new()),
            revision: AtomicU64::new(0),
        }
    }
    #[test]
    fn phrase_replacement_is_boundary_safe() {
        assert_eq!(
            replace_phrase("use effect now", "use effect", "useEffect"),
            "useEffect now"
        );
        assert_eq!(
            replace_phrase("use effects", "use effect", "useEffect"),
            "use effects"
        );
    }

    #[test]
    fn hotwords_use_spoken_forms_and_revision_changes() {
        let store = test_store();
        store.entries.write().unwrap().push(DictionaryEntry {
            id: 1,
            term: "useEffect".into(),
            pronunciation: Some("use effect".into()),
            entry_type: "jargon".into(),
            note: None,
        });
        assert_eq!(store.hotwords(), (0, "use effect".to_string()));
        store.revision.fetch_add(1, Ordering::Relaxed);
        assert_eq!(store.hotwords().0, 1);
    }
}
