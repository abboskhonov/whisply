use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::{Mutex, RwLock};
use std::time::Duration;
use tauri::{AppHandle, State};

const MAX_NAME_LENGTH: usize = 100;
const MAX_BODY_LENGTH: usize = 10_000;
const MAX_TAGS: usize = 10;
const MAX_TAG_LENGTH: usize = 40;

pub struct SnippetStore {
    connection: Mutex<Connection>,
    snippets: RwLock<Vec<Snippet>>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Snippet {
    pub id: i64,
    pub name: String,
    pub body: String,
    pub tags: Vec<String>,
    pub used_count: u64,
}

impl SnippetStore {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let path = crate::history::database_path(app)?;
        let connection = Connection::open(&path).map_err(|error| {
            format!(
                "Could not open snippets database {}: {error}",
                path.display()
            )
        })?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|error| format!("Could not configure snippets database: {error}"))?;
        connection
            .execute_batch(
                "
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS snippets (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    body TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    used_count INTEGER NOT NULL DEFAULT 0,
                    created_at_ms INTEGER NOT NULL
                );
                ",
            )
            .map_err(|error| format!("Could not initialize snippets database: {error}"))?;
        let snippets = load_snippets(&connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
            snippets: RwLock::new(snippets),
        })
    }

    pub fn resolve_spoken_command(&self, transcript: &str) -> Option<Snippet> {
        let transcript = transcript.trim();
        let command = transcript
            .get(..7)
            .filter(|prefix| prefix.eq_ignore_ascii_case("insert "))
            .map(|_| &transcript[7..])?;
        let requested_name = normalize_name(command);
        if requested_name.is_empty() {
            return None;
        }

        self.snippets
            .read()
            .ok()?
            .iter()
            .find(|snippet| normalize_name(&snippet.name) == requested_name)
            .cloned()
    }

    pub fn mark_used(&self, snippet_id: i64) -> Result<(), String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("Snippets database lock failed: {error}"))?;
        connection
            .execute(
                "UPDATE snippets SET used_count = used_count + 1 WHERE id = ?1",
                [snippet_id],
            )
            .map_err(|error| format!("Could not update snippet usage: {error}"))?;
        drop(connection);

        let mut snippets = self
            .snippets
            .write()
            .map_err(|error| format!("Snippets cache lock failed: {error}"))?;
        if let Some(snippet) = snippets.iter_mut().find(|snippet| snippet.id == snippet_id) {
            snippet.used_count += 1;
        }
        Ok(())
    }

    fn list(&self) -> Result<Vec<Snippet>, String> {
        self.snippets
            .read()
            .map(|snippets| snippets.clone())
            .map_err(|error| format!("Snippets cache lock failed: {error}"))
    }

    fn add(&self, name: String, body: String, tags: Vec<String>) -> Result<Snippet, String> {
        let name = validate_text(name, "Snippet name", MAX_NAME_LENGTH)?;
        let body = validate_text(body, "Snippet text", MAX_BODY_LENGTH)?;
        let tags = normalize_tags(tags)?;
        let tags_json = serde_json::to_string(&tags)
            .map_err(|error| format!("Could not encode snippet tags: {error}"))?;
        let created_at_ms = crate::history::unix_timestamp_ms()?;
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("Snippets database lock failed: {error}"))?;
        connection
            .execute(
                "
                INSERT INTO snippets (name, body, tags_json, created_at_ms)
                VALUES (?1, ?2, ?3, ?4)
                ",
                params![name, body, tags_json, created_at_ms],
            )
            .map_err(|error| format!("Could not save snippet: {error}"))?;
        let snippet = Snippet {
            id: connection.last_insert_rowid(),
            name,
            body,
            tags,
            used_count: 0,
        };
        drop(connection);

        let mut snippets = self
            .snippets
            .write()
            .map_err(|error| format!("Snippets cache lock failed: {error}"))?;
        snippets.push(snippet.clone());
        snippets.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        Ok(snippet)
    }

    fn delete(&self, snippet_id: i64) -> Result<(), String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("Snippets database lock failed: {error}"))?;
        let deleted = connection
            .execute("DELETE FROM snippets WHERE id = ?1", [snippet_id])
            .map_err(|error| format!("Could not delete snippet: {error}"))?;
        if deleted == 0 {
            return Err("Snippet no longer exists".to_string());
        }
        drop(connection);

        self.snippets
            .write()
            .map_err(|error| format!("Snippets cache lock failed: {error}"))?
            .retain(|snippet| snippet.id != snippet_id);
        Ok(())
    }
}

fn load_snippets(connection: &Connection) -> Result<Vec<Snippet>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, body, tags_json, used_count
            FROM snippets
            ORDER BY name COLLATE NOCASE ASC
            ",
        )
        .map_err(|error| format!("Could not prepare snippets query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(3)?;
            let tags = serde_json::from_str(&tags_json).unwrap_or_default();
            Ok(Snippet {
                id: row.get(0)?,
                name: row.get(1)?,
                body: row.get(2)?,
                tags,
                used_count: row.get(4)?,
            })
        })
        .map_err(|error| format!("Could not query snippets: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read snippets: {error}"))
}

fn validate_text(value: String, label: &str, max_length: usize) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if value.chars().count() > max_length {
        return Err(format!("{label} must be {max_length} characters or fewer"));
    }
    Ok(value)
}

fn normalize_tags(tags: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let tag = tag.trim().to_lowercase();
        if tag.is_empty() || normalized.iter().any(|existing| existing == &tag) {
            continue;
        }
        if tag.chars().count() > MAX_TAG_LENGTH {
            return Err(format!("Tags must be {MAX_TAG_LENGTH} characters or fewer"));
        }
        normalized.push(tag);
    }
    if normalized.len() > MAX_TAGS {
        return Err(format!("Use at most {MAX_TAGS} tags per snippet"));
    }
    Ok(normalized)
}

fn normalize_name(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn list_snippets(store: State<'_, SnippetStore>) -> Result<Vec<Snippet>, String> {
    store.list()
}

#[tauri::command]
pub fn add_snippet(
    store: State<'_, SnippetStore>,
    name: String,
    body: String,
    tags: Vec<String>,
) -> Result<Snippet, String> {
    store.add(name, body, tags)
}

#[tauri::command]
pub fn delete_snippet(store: State<'_, SnippetStore>, snippet_id: i64) -> Result<(), String> {
    store.delete(snippet_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_an_explicit_spoken_command() {
        assert_eq!(normalize_name("Standup opener."), "standup opener");
        assert_eq!(normalize_name("  Standup--opener  "), "standup opener");
    }

    #[test]
    fn resolves_only_a_complete_insert_command() {
        let store = SnippetStore {
            connection: Mutex::new(Connection::open_in_memory().unwrap()),
            snippets: RwLock::new(vec![Snippet {
                id: 1,
                name: "Standup opener".to_string(),
                body: "Yesterday, today, blockers.".to_string(),
                tags: vec![],
                used_count: 0,
            }]),
        };

        assert_eq!(
            store
                .resolve_spoken_command("Insert standup opener.")
                .unwrap()
                .body,
            "Yesterday, today, blockers."
        );
        assert!(store
            .resolve_spoken_command("Please insert standup opener")
            .is_none());
    }
}
