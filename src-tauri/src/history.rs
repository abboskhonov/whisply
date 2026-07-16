use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const DATABASE_FILE: &str = "history.sqlite3";
const RECENT_DICTATIONS_LIMIT: i64 = 100;
const DICTATION_ARCHIVE_PAGE_SIZE: usize = 50;

pub struct HistoryStore {
    connection: Mutex<Connection>,
}

#[derive(Debug, Serialize)]
pub struct HomeDashboard {
    pub today: DashboardDay,
    pub yesterday: DashboardDay,
    pub week_dictation_duration_ms: u64,
    pub active_days_this_week: u32,
    pub recent_dictations: Vec<StoredDictation>,
}

#[derive(Debug, Serialize)]
pub struct DashboardDay {
    pub word_count: u64,
    pub dictation_count: u64,
    pub audio_duration_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct StoredDictation {
    pub id: i64,
    pub created_at_ms: i64,
    pub text: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryDateRange {
    Today,
    LastSevenDays,
    ThisMonth,
    AllTime,
}

#[derive(Debug, Deserialize)]
pub struct DictationArchiveQuery {
    pub cursor: Option<DictationArchiveCursor>,
    pub search: Option<String>,
    pub date_range: HistoryDateRange,
    pub insertion_method: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DictationArchiveCursor {
    pub created_at_ms: i64,
    pub id: i64,
}

#[derive(Debug, Serialize)]
pub struct DictationArchivePage {
    pub dictations: Vec<ArchiveDictation>,
    pub insertion_methods: Vec<String>,
    pub next_cursor: Option<DictationArchiveCursor>,
}

#[derive(Debug, Serialize)]
pub struct ArchiveDictation {
    pub id: i64,
    pub created_at_ms: i64,
    pub text: String,
    pub word_count: i64,
    pub audio_duration_ms: i64,
    pub insertion_method: String,
}

#[derive(Debug, Serialize)]
pub struct InsightsDashboard {
    pub total_word_count: u64,
    pub total_dictation_count: u64,
    pub average_words_per_minute: u64,
    pub insertion_methods: Vec<InsertionMethodUsage>,
    pub current_streak_days: u64,
    pub longest_streak_days: u64,
    pub activity: Vec<DailyActivity>,
}

#[derive(Debug, Serialize)]
pub struct InsertionMethodUsage {
    pub method: String,
    pub dictation_count: u64,
}

#[derive(Debug, Serialize)]
pub struct DailyActivity {
    pub date: String,
    pub dictation_count: u64,
}

impl HistoryStore {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let path = database_path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Could not create history directory {}: {error}",
                    parent.display()
                )
            })?;
        }

        let connection = Connection::open(&path).map_err(|error| {
            format!(
                "Could not open history database {}: {error}",
                path.display()
            )
        })?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|error| format!("Could not configure history database: {error}"))?;
        connection
            .execute_batch(
                "
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS dictations (
                    id INTEGER PRIMARY KEY,
                    created_at_ms INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    word_count INTEGER NOT NULL,
                    audio_duration_ms INTEGER NOT NULL,
                    transcription_duration_ms INTEGER NOT NULL,
                    insertion_method TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_dictations_created_at
                    ON dictations(created_at_ms DESC);
                CREATE INDEX IF NOT EXISTS idx_dictations_archive_cursor
                    ON dictations(created_at_ms DESC, id DESC);
                ",
            )
            .map_err(|error| format!("Could not initialize history database: {error}"))?;

        log::info!("dictation history ready at {}", path.display());
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn record_dictation(
        &self,
        result: &crate::dictation::DictationResult,
    ) -> Result<(), String> {
        let created_at_ms = unix_timestamp_ms()?;
        let word_count = i64::try_from(result.text.split_whitespace().count())
            .map_err(|error| format!("Dictation word count is too large: {error}"))?;
        let audio_duration_ms = i64::try_from(result.audio_duration_ms)
            .map_err(|error| format!("Audio duration is too large: {error}"))?;
        let transcription_duration_ms = i64::try_from(result.transcription_duration_ms)
            .map_err(|error| format!("Transcription duration is too large: {error}"))?;
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("History database lock failed: {error}"))?;

        connection
            .execute(
                "
                INSERT INTO dictations (
                    created_at_ms,
                    text,
                    word_count,
                    audio_duration_ms,
                    transcription_duration_ms,
                    insertion_method
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ",
                params![
                    created_at_ms,
                    result.text,
                    word_count,
                    audio_duration_ms,
                    transcription_duration_ms,
                    result.insertion_method,
                ],
            )
            .map_err(|error| format!("Could not save dictation history: {error}"))?;

        Ok(())
    }

    fn delete_dictation(&self, id: i64) -> Result<(), String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("History database lock failed: {error}"))?;

        connection
            .execute("DELETE FROM dictations WHERE id = ?1", params![id])
            .map_err(|error| format!("Could not delete dictation history: {error}"))?;

        Ok(())
    }

    fn home_dashboard(&self) -> Result<HomeDashboard, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("History database lock failed: {error}"))?;
        let today = day_summary(&connection, 0)?;
        let yesterday = day_summary(&connection, -1)?;
        let week_dictation_duration_ms: i64 = connection
            .query_row(
                "
                SELECT COALESCE(SUM(audio_duration_ms), 0)
                FROM dictations
                WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                    >= date('now', '-6 days', 'localtime')
                ",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("Could not load weekly dictation duration: {error}"))?;
        let active_days_this_week: i64 = connection
            .query_row(
                "
                SELECT COUNT(DISTINCT date(created_at_ms / 1000, 'unixepoch', 'localtime'))
                FROM dictations
                WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                    >= date('now', '-6 days', 'localtime')
                ",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("Could not load active dictation days: {error}"))?;
        let recent_dictations = recent_dictations(&connection)?;

        Ok(HomeDashboard {
            today,
            yesterday,
            week_dictation_duration_ms: to_u64(week_dictation_duration_ms)?,
            active_days_this_week: u32::try_from(active_days_this_week)
                .map_err(|error| format!("Active day count is invalid: {error}"))?,
            recent_dictations,
        })
    }

    fn dictation_archive(
        &self,
        query: DictationArchiveQuery,
    ) -> Result<DictationArchivePage, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("History database lock failed: {error}"))?;
        let cursor = query.cursor.unwrap_or(DictationArchiveCursor {
            created_at_ms: i64::MAX,
            id: i64::MAX,
        });
        let search = query.search.unwrap_or_default().trim().to_string();
        let date_range_clause = date_range_clause(query.date_range);
        let insertion_methods = insertion_methods_for_range(&connection, query.date_range)?;
        let sql = format!(
            "
            SELECT id, created_at_ms, text, word_count, audio_duration_ms, insertion_method
            FROM dictations
            WHERE (created_at_ms < ?1 OR (created_at_ms = ?1 AND id < ?2))
                AND instr(lower(text), lower(?3)) > 0
                AND (?4 IS NULL OR insertion_method = ?4)
                AND {date_range_clause}
            ORDER BY created_at_ms DESC, id DESC
            LIMIT ?5
            "
        );
        let mut statement = connection
            .prepare(&sql)
            .map_err(|error| format!("Could not prepare dictation archive query: {error}"))?;
        let rows = statement
            .query_map(
                params![
                    cursor.created_at_ms,
                    cursor.id,
                    search,
                    query.insertion_method,
                    i64::try_from(DICTATION_ARCHIVE_PAGE_SIZE + 1)
                        .map_err(|error| format!("Archive page size is invalid: {error}"))?,
                ],
                |row| {
                    Ok(ArchiveDictation {
                        id: row.get(0)?,
                        created_at_ms: row.get(1)?,
                        text: row.get(2)?,
                        word_count: row.get(3)?,
                        audio_duration_ms: row.get(4)?,
                        insertion_method: row.get(5)?,
                    })
                },
            )
            .map_err(|error| format!("Could not query dictation archive: {error}"))?;
        let mut dictations = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Could not read dictation archive: {error}"))?;
        let has_next_page = dictations.len() > DICTATION_ARCHIVE_PAGE_SIZE;
        dictations.truncate(DICTATION_ARCHIVE_PAGE_SIZE);
        let next_cursor = has_next_page.then(|| {
            let dictation = dictations
                .last()
                .expect("A full archive page must contain a final dictation");
            DictationArchiveCursor {
                created_at_ms: dictation.created_at_ms,
                id: dictation.id,
            }
        });

        Ok(DictationArchivePage {
            dictations,
            insertion_methods,
            next_cursor,
        })
    }

    fn insights_dashboard(
        &self,
        date_range: HistoryDateRange,
    ) -> Result<InsightsDashboard, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("History database lock failed: {error}"))?;
        let date_range_clause = date_range_clause(date_range);
        let summary_sql = format!(
            "
            SELECT
                COALESCE(SUM(word_count), 0),
                COUNT(*),
                COALESCE(SUM(audio_duration_ms), 0)
            FROM dictations
            WHERE {date_range_clause}
            "
        );
        let (total_word_count, total_dictation_count, total_audio_duration_ms): (i64, i64, i64) =
            connection
                .query_row(&summary_sql, [], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|error| format!("Could not load insights summary: {error}"))?;
        let total_word_count = to_u64(total_word_count)?;
        let total_audio_duration_ms = to_u64(total_audio_duration_ms)?;
        let average_words_per_minute = if total_audio_duration_ms == 0 {
            0
        } else {
            total_word_count.saturating_mul(60_000) / total_audio_duration_ms
        };

        Ok(InsightsDashboard {
            total_word_count,
            total_dictation_count: to_u64(total_dictation_count)?,
            average_words_per_minute,
            insertion_methods: insertion_method_usage(&connection, date_range)?,
            current_streak_days: current_streak_days(&connection)?,
            longest_streak_days: longest_streak_days(&connection)?,
            activity: recent_daily_activity(&connection, date_range)?,
        })
    }
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(DATABASE_FILE))
        .map_err(|error| format!("Could not resolve history database path: {error}"))
}

pub fn unix_timestamp_ms() -> Result<i64, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("System clock is before the Unix epoch: {error}"))?
        .as_millis();
    i64::try_from(timestamp).map_err(|error| format!("Current timestamp is too large: {error}"))
}

fn day_summary(connection: &Connection, days_ago: i32) -> Result<DashboardDay, String> {
    let offset = format!("{days_ago} days");
    let (word_count, dictation_count, audio_duration_ms): (i64, i64, i64) = connection
        .query_row(
            "
            SELECT
                COALESCE(SUM(word_count), 0),
                COUNT(*),
                COALESCE(SUM(audio_duration_ms), 0)
            FROM dictations
            WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                = date('now', ?1, 'localtime')
            ",
            [offset],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| format!("Could not load daily dictation summary: {error}"))?;

    Ok(DashboardDay {
        word_count: to_u64(word_count)?,
        dictation_count: to_u64(dictation_count)?,
        audio_duration_ms: to_u64(audio_duration_ms)?,
    })
}

fn recent_dictations(connection: &Connection) -> Result<Vec<StoredDictation>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, created_at_ms, text
            FROM dictations
            WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                IN (date('now', 'localtime'), date('now', '-1 day', 'localtime'))
            ORDER BY created_at_ms DESC
            LIMIT ?1
            ",
        )
        .map_err(|error| format!("Could not prepare recent dictations query: {error}"))?;
    let rows = statement
        .query_map([RECENT_DICTATIONS_LIMIT], |row| {
            Ok(StoredDictation {
                id: row.get(0)?,
                created_at_ms: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|error| format!("Could not query recent dictations: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read recent dictations: {error}"))
}

fn date_range_clause(date_range: HistoryDateRange) -> &'static str {
    match date_range {
        HistoryDateRange::Today => {
            "date(created_at_ms / 1000, 'unixepoch', 'localtime') = date('now', 'localtime')"
        }
        HistoryDateRange::LastSevenDays => {
            "date(created_at_ms / 1000, 'unixepoch', 'localtime') BETWEEN date('now', '-6 days', 'localtime') AND date('now', 'localtime')"
        }
        HistoryDateRange::ThisMonth => {
            "date(created_at_ms / 1000, 'unixepoch', 'localtime') BETWEEN date('now', 'start of month', 'localtime') AND date('now', 'localtime')"
        }
        HistoryDateRange::AllTime => "1 = 1",
    }
}

fn insertion_methods_for_range(
    connection: &Connection,
    date_range: HistoryDateRange,
) -> Result<Vec<String>, String> {
    let sql = format!(
        "
        SELECT DISTINCT insertion_method
        FROM dictations
        WHERE {}
        ORDER BY insertion_method ASC
        ",
        date_range_clause(date_range)
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare archive insertion methods query: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| format!("Could not query archive insertion methods: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read archive insertion methods: {error}"))
}

fn insertion_method_usage(
    connection: &Connection,
    date_range: HistoryDateRange,
) -> Result<Vec<InsertionMethodUsage>, String> {
    let sql = format!(
        "
        SELECT insertion_method, COUNT(*)
        FROM dictations
        WHERE {}
        GROUP BY insertion_method
        ORDER BY COUNT(*) DESC, insertion_method ASC
        LIMIT 6
        ",
        date_range_clause(date_range)
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare insertion method query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(InsertionMethodUsage {
                method: row.get(0)?,
                dictation_count: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query insertion methods: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read insertion methods: {error}"))
}

fn current_streak_days(connection: &Connection) -> Result<u64, String> {
    let count: i64 = connection
        .query_row(
            "
            WITH RECURSIVE streak(day) AS (
                SELECT date('now', 'localtime')
                WHERE EXISTS (
                    SELECT 1
                    FROM dictations
                    WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                        = date('now', 'localtime')
                )
                UNION ALL
                SELECT date(streak.day, '-1 day')
                FROM streak
                WHERE EXISTS (
                    SELECT 1
                    FROM dictations
                    WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                        = date(streak.day, '-1 day')
                )
            )
            SELECT COUNT(*) FROM streak
            ",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Could not load current streak: {error}"))?;
    to_u64(count)
}

fn longest_streak_days(connection: &Connection) -> Result<u64, String> {
    let count: i64 = connection
        .query_row(
            "
            WITH active_days AS (
                SELECT DISTINCT date(created_at_ms / 1000, 'unixepoch', 'localtime') AS day
                FROM dictations
            ), grouped_days AS (
                SELECT day, julianday(day) - ROW_NUMBER() OVER (ORDER BY day) AS streak_group
                FROM active_days
            ), streaks AS (
                SELECT COUNT(*) AS day_count
                FROM grouped_days
                GROUP BY streak_group
            )
            SELECT COALESCE(MAX(day_count), 0) FROM streaks
            ",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Could not load longest streak: {error}"))?;
    to_u64(count)
}

fn recent_daily_activity(
    connection: &Connection,
    date_range: HistoryDateRange,
) -> Result<Vec<DailyActivity>, String> {
    let sql = format!(
        "
        SELECT
            date(created_at_ms / 1000, 'unixepoch', 'localtime') AS day,
            COUNT(*)
        FROM dictations
        WHERE {}
        GROUP BY day
        ORDER BY day ASC
        ",
        date_range_clause(date_range)
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare recent activity query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DailyActivity {
                date: row.get(0)?,
                dictation_count: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query recent activity: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read recent activity: {error}"))
}

fn to_u64(value: i64) -> Result<u64, String> {
    u64::try_from(value).map_err(|error| format!("History value is invalid: {error}"))
}

#[tauri::command]
pub fn get_home_dashboard(store: State<'_, HistoryStore>) -> Result<HomeDashboard, String> {
    store.home_dashboard()
}

#[tauri::command]
pub fn get_insights_dashboard(
    date_range: HistoryDateRange,
    store: State<'_, HistoryStore>,
) -> Result<InsightsDashboard, String> {
    store.insights_dashboard(date_range)
}

#[tauri::command]
pub fn delete_dictation(id: i64, store: State<'_, HistoryStore>) -> Result<(), String> {
    store.delete_dictation(id)
}

#[tauri::command]
pub fn get_dictation_archive(
    query: DictationArchiveQuery,
    store: State<'_, HistoryStore>,
) -> Result<DictationArchivePage, String> {
    store.dictation_archive(query)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_store() -> HistoryStore {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE dictations (
                    id INTEGER PRIMARY KEY,
                    created_at_ms INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    word_count INTEGER NOT NULL,
                    audio_duration_ms INTEGER NOT NULL,
                    transcription_duration_ms INTEGER NOT NULL,
                    insertion_method TEXT NOT NULL
                );
                CREATE INDEX idx_dictations_created_at ON dictations(created_at_ms DESC);
                ",
            )
            .unwrap();
        HistoryStore {
            connection: Mutex::new(connection),
        }
    }

    #[test]
    fn paginates_the_complete_archive_in_newest_first_order() {
        let store = in_memory_store();
        let connection = store.connection.lock().unwrap();
        for id in 1..=51 {
            connection
                .execute(
                    "
                    INSERT INTO dictations (
                        id, created_at_ms, text, word_count, audio_duration_ms,
                        transcription_duration_ms, insertion_method
                    ) VALUES (?1, ?2, ?3, 1, 1_000, 1_000, 'clipboard')
                    ",
                    params![id, 10_000 - id, format!("dictation {id}")],
                )
                .unwrap();
        }
        drop(connection);

        let first_page = store
            .dictation_archive(DictationArchiveQuery {
                cursor: None,
                search: None,
                date_range: HistoryDateRange::AllTime,
                insertion_method: None,
            })
            .unwrap();
        assert_eq!(first_page.dictations.len(), DICTATION_ARCHIVE_PAGE_SIZE);
        assert_eq!(first_page.dictations[0].id, 1);
        assert_eq!(first_page.dictations.last().unwrap().id, 50);

        let second_page = store
            .dictation_archive(DictationArchiveQuery {
                cursor: first_page.next_cursor,
                search: None,
                date_range: HistoryDateRange::AllTime,
                insertion_method: None,
            })
            .unwrap();
        assert_eq!(second_page.dictations.len(), 1);
        assert_eq!(second_page.dictations[0].id, 51);
        assert!(second_page.next_cursor.is_none());
    }

    #[test]
    fn archive_filters_compose_search_date_range_and_insertion_method() {
        let store = in_memory_store();
        let connection = store.connection.lock().unwrap();
        for (offset, text, method) in [
            ("0 days", "matching clipboard", "clipboard"),
            ("0 days", "matching direct", "direct"),
            ("-7 days", "matching older", "clipboard"),
        ] {
            connection
                .execute(
                    "
                    INSERT INTO dictations (
                        created_at_ms, text, word_count, audio_duration_ms,
                        transcription_duration_ms, insertion_method
                    ) VALUES (
                        CAST(strftime('%s', 'now', ?1) AS INTEGER) * 1000,
                        ?2, 2, 1_000, 1_000, ?3
                    )
                    ",
                    params![offset, text, method],
                )
                .unwrap();
        }
        drop(connection);

        let page = store
            .dictation_archive(DictationArchiveQuery {
                cursor: None,
                search: Some("matching".to_string()),
                date_range: HistoryDateRange::Today,
                insertion_method: Some("clipboard".to_string()),
            })
            .unwrap();

        assert_eq!(page.dictations.len(), 1);
        assert_eq!(page.dictations[0].text, "matching clipboard");
        assert_eq!(page.insertion_methods, ["clipboard", "direct"]);
    }

    #[test]
    fn deletes_a_dictation() {
        let store = in_memory_store();
        store
            .connection
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO dictations (created_at_ms, text, word_count, audio_duration_ms, transcription_duration_ms, insertion_method) VALUES (1, 'Delete me', 2, 1_000, 1_000, 'clipboard')",
                [],
            )
            .unwrap();

        store.delete_dictation(1).unwrap();

        let count: i64 = store
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM dictations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn records_the_text_and_word_count() {
        let store = in_memory_store();
        let result = crate::dictation::DictationResult {
            text: "  Two\nreal words  ".to_string(),
            audio_duration_ms: 2_000,
            transcription_duration_ms: 300,
            insertion_method: "clipboard".to_string(),
        };

        store.record_dictation(&result).unwrap();

        {
            let connection = store.connection.lock().unwrap();
            let (text, word_count): (String, i64) = connection
                .query_row("SELECT text, word_count FROM dictations", [], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })
                .unwrap();
            assert_eq!(text, result.text);
            assert_eq!(word_count, 3);
        }

        let dashboard = store.home_dashboard().unwrap();
        assert_eq!(dashboard.today.word_count, 3);
        assert_eq!(dashboard.today.dictation_count, 1);
        assert_eq!(dashboard.recent_dictations.len(), 1);
        assert_eq!(dashboard.recent_dictations[0].text, result.text);

        let insights = store.insights_dashboard(HistoryDateRange::AllTime).unwrap();
        assert_eq!(insights.total_word_count, 3);
        assert_eq!(insights.total_dictation_count, 1);
        assert_eq!(insights.average_words_per_minute, 90);
        assert_eq!(insights.insertion_methods.len(), 1);
        assert_eq!(insights.current_streak_days, 1);
        assert_eq!(insights.longest_streak_days, 1);
        assert_eq!(insights.activity.len(), 1);
    }
}
