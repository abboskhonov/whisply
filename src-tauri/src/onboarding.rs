use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// The onboarding window is a separate small desktop window. It's
/// created lazily the first time we need it and reused across opens —
/// the same webview keeps its `localStorage`, so per-window state (like
/// the current step) survives a close + reopen.
pub const ONBOARDING_LABEL: &str = "onboarding";
const ONBOARDING_WIDTH: f64 = 760.0;
const ONBOARDING_HEIGHT: f64 = 720.0;
const ONBOARDING_MIN_WIDTH: f64 = 620.0;
const ONBOARDING_MIN_HEIGHT: f64 = 540.0;
const STATE_FILE: &str = "onboarding-state.json";

/// On-disk shape. Lives at `app_data_dir()/onboarding-state.json`.
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
pub struct OnboardingStateFile {
    #[serde(default)]
    pub is_complete: bool,
}

/// In-memory cache of the persisted state. Wrapped in a Mutex so the
/// `tauri::State` can hand it out to command handlers safely.
pub struct OnboardingState {
    pub is_complete: Mutex<bool>,
    state_path: Mutex<Option<PathBuf>>,
}

impl OnboardingState {
    pub fn new() -> Self {
        Self {
            is_complete: Mutex::new(false),
            state_path: Mutex::new(None),
        }
    }

    /// Resolve the state file under the app data dir and load whatever
    /// is on disk. Called once during `setup`. Missing file = default
    /// (not complete), corrupt file = logged + default.
    pub fn init(&self, app: &AppHandle) {
        let path = match app.path().app_data_dir() {
            Ok(dir) => dir.join(STATE_FILE),
            Err(e) => {
                log::error!("could not resolve app data dir: {e}");
                return;
            }
        };

        match fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<OnboardingStateFile>(&text) {
                Ok(parsed) => {
                    *self.is_complete.lock().unwrap() = parsed.is_complete;
                    log::info!(
                        "onboarding state loaded from {} (complete={})",
                        path.display(),
                        parsed.is_complete
                    );
                }
                Err(e) => {
                    log::warn!("onboarding state file corrupt ({e}); using defaults");
                }
            },
            Err(_) => {
                log::info!("no onboarding state file yet; starting fresh");
            }
        }

        *self.state_path.lock().unwrap() = Some(path);
    }

    /// Flush the in-memory state to disk. Best-effort; logs on failure
    /// rather than panicking because losing the marker just means the
    /// user sees the wizard once more.
    fn save(&self) {
        let path = match self.state_path.lock().unwrap().clone() {
            Some(p) => p,
            None => return,
        };

        if let Some(parent) = path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                log::error!("failed to create {}: {e}", parent.display());
                return;
            }
        }

        let data = OnboardingStateFile {
            is_complete: *self.is_complete.lock().unwrap(),
        };

        match serde_json::to_string_pretty(&data) {
            Ok(json) => {
                if let Err(e) = fs::write(&path, json) {
                    log::error!("failed to write {}: {e}", path.display());
                }
            }
            Err(e) => log::error!("failed to serialise onboarding state: {e}"),
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────

/// `invoke('is_onboarding_complete')` — used by the main app on boot
/// to decide whether to open the wizard.
#[tauri::command]
pub fn is_onboarding_complete(state: tauri::State<'_, OnboardingState>) -> bool {
    *state.is_complete.lock().unwrap()
}

/// Called from the onboarding window when the user clicks
/// "Start using Whisply". Persists, closes the window, and pings the
/// main window so it can swap to the home view.
#[tauri::command]
pub fn mark_onboarding_complete(
    app: AppHandle,
    state: tauri::State<'_, OnboardingState>,
) {
    *state.is_complete.lock().unwrap() = true;
    state.save();

    if let Some(window) = app.get_webview_window(ONBOARDING_LABEL) {
        let _ = window.close();
    }

    let _ = app.emit("whisply://onboarding-complete", ());
    log::info!("onboarding marked complete");
}

/// Called from Settings → "Open wizard". Clears the marker (so the
/// redirect kicks in next time the main app loads), then shows the
/// onboarding window.
#[tauri::command]
pub fn reset_onboarding(
    app: AppHandle,
    state: tauri::State<'_, OnboardingState>,
) {
    *state.is_complete.lock().unwrap() = false;
    state.save();
    show(&app);
    log::info!("onboarding reset and window opened");
}

/// Show the onboarding window. Creates it on first call.
#[tauri::command]
pub fn open_onboarding_window(app: AppHandle) {
    show(&app);
}

// ── Window helpers ────────────────────────────────────────────────────────

/// Make the onboarding window visible, creating it on first use.
pub fn show(app: &AppHandle) {
    ensure_window(app);
    if let Some(window) = app.get_webview_window(ONBOARDING_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Create the onboarding webview if it doesn't exist yet. Mirrors the
/// `recording_overlay` pattern in `overlay.rs` — defined in Rust so
/// `setup` can rebuild it after a hot reload in dev.
pub fn ensure_window(app: &AppHandle) {
    if app.get_webview_window(ONBOARDING_LABEL).is_some() {
        return;
    }

    log::info!("Creating onboarding window");
    let url = WebviewUrl::App("onboarding.html".into());
    let result = WebviewWindowBuilder::new(app, ONBOARDING_LABEL, url)
        .title("Welcome to Whisply")
        .inner_size(ONBOARDING_WIDTH, ONBOARDING_HEIGHT)
        .min_inner_size(ONBOARDING_MIN_WIDTH, ONBOARDING_MIN_HEIGHT)
        .resizable(true)
        .decorations(true)
        .focused(true)
        .visible(false)
        .center()
        .build();

    match result {
        Ok(_) => log::info!("onboarding window created"),
        Err(e) => log::error!("failed to create onboarding window: {e}"),
    }
}

/// Called from `setup`. If onboarding isn't done, opens the wizard.
/// Main app's `routes/index.tsx` uses `is_onboarding_complete` to
/// decide what to render; this call is the user-friendly path that
/// actually shows the window.
pub fn open_if_incomplete(app: &AppHandle) {
    let state = app.state::<OnboardingState>();
    if !*state.is_complete.lock().unwrap() {
        show(app);
    }
}
