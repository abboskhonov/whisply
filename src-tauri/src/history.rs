use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const DATABASE_FILE: &str = "history.sqlite3";
const RECENT_DICTATIONS_LIMIT: i64 = 100;

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

    fn insights_dashboard(&self) -> Result<InsightsDashboard, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|error| format!("History database lock failed: {error}"))?;
        let (total_word_count, total_dictation_count, total_audio_duration_ms): (i64, i64, i64) =
            connection
                .query_row(
                    "
                    SELECT
                        COALESCE(SUM(word_count), 0),
                        COUNT(*),
                        COALESCE(SUM(audio_duration_ms), 0)
                    FROM dictations
                    ",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
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
            insertion_methods: insertion_method_usage(&connection)?,
            current_streak_days: current_streak_days(&connection)?,
            longest_streak_days: longest_streak_days(&connection)?,
            activity: recent_daily_activity(&connection)?,
        })
    }
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(DATABASE_FILE))
        .map_err(|error| format!("Could not resolve history database path: {error}"))
}

fn unix_timestamp_ms() -> Result<i64, String> {
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

fn insertion_method_usage(connection: &Connection) -> Result<Vec<InsertionMethodUsage>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT insertion_method, COUNT(*)
            FROM dictations
            GROUP BY insertion_method
            ORDER BY COUNT(*) DESC, insertion_method ASC
            LIMIT 6
            ",
        )
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

fn recent_daily_activity(connection: &Connection) -> Result<Vec<DailyActivity>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT
                date(created_at_ms / 1000, 'unixepoch', 'localtime') AS day,
                COUNT(*)
            FROM dictations
            WHERE date(created_at_ms / 1000, 'unixepoch', 'localtime')
                >= date('now', '-181 days', 'localtime')
            GROUP BY day
            ORDER BY day ASC
            ",
        )
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
pub fn get_insights_dashboard(store: State<'_, HistoryStore>) -> Result<InsightsDashboard, String> {
    store.insights_dashboard()
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

        let insights = store.insights_dashboard().unwrap();
        assert_eq!(insights.total_word_count, 3);
        assert_eq!(insights.total_dictation_count, 1);
        assert_eq!(insights.average_words_per_minute, 90);
        assert_eq!(insights.insertion_methods.len(), 1);
        assert_eq!(insights.current_streak_days, 1);
        assert_eq!(insights.longest_streak_days, 1);
        assert_eq!(insights.activity.len(), 1);
    }
}
