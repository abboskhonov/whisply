use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

// ── State ───────────────────────────────────────────────────────────────────

/// Track which shortcut strings we currently have registered with the
/// Tauri plugin so we can unregister them on changes without poking
/// at the plugin's internal state.
pub struct ShortcutRegistry(pub Arc<Mutex<Vec<RegisteredShortcut>>>);

/// How the shortcut should react to the OS press/release events.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TriggerMode {
    /// Press-and-hold: pressed starts capture, released stops it.
    Hold,
    /// Tap-to-toggle: pressed flips between idle and recording; release
    /// is ignored. Best for long dictation sessions.
    Toggle,
}

impl TriggerMode {
    fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "toggle" | "press" | "tap" => TriggerMode::Toggle,
            _ => TriggerMode::Hold,
        }
    }
}

pub struct RegisteredShortcut {
    /// Canonical string the user configured (e.g. "Ctrl+CapsLock").
    pub key_str: String,
    /// Parsed `Shortcut` from the plugin. Held so we can unregister.
    pub parsed: Shortcut,
    /// Hold (press-and-hold) or toggle (tap to start, tap again to stop).
    pub mode: TriggerMode,
}

impl Clone for RegisteredShortcut {
    fn clone(&self) -> Self {
        // Shortcut isn't Clone in the plugin, so rebuild from the string.
        let parsed = self
            .key_str
            .split('+')
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join("+")
            .parse::<Shortcut>()
            .unwrap_or_else(|_| self.parsed.clone());
        Self {
            key_str: self.key_str.clone(),
            parsed,
            mode: self.mode,
        }
    }
}

impl ShortcutRegistry {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(Vec::new())))
    }
}

/// Tauri-managed state: flag so we only start the listener once.
pub struct ListenerRunning(pub Arc<AtomicBool>);

impl ListenerRunning {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}

// ── String → Shortcut conversion ────────────────────────────────────────────

/// Convert our combo format ("Super+V", "Ctrl+CapsLock") to the format
/// `tauri-plugin-global-shortcut` expects ("Super+V", "Ctrl+CapsLock"
/// — same on Linux, but on macOS we normalise "Super" → "CommandOrControl"
/// and lowercase the key).
fn normalize_for_plugin(raw: &str) -> String {
    let parts: Vec<String> = raw
        .split('+')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| {
            // Normalise the modifier names the plugin understands.
            match p.to_lowercase().as_str() {
                "ctrl" | "control" => "Ctrl".to_string(),
                "alt" | "option" => "Alt".to_string(),
                "shift" => "Shift".to_string(),
                "super" | "meta" | "cmd" | "command" | "win" | "windows" => {
                    "Super".to_string()
                }
                other => {
                    // Capitalise the first character of the key for display,
                    // but keep the rest (so "CapsLock" stays "CapsLock" and
                    // "," stays ",").
                    let mut chars = other.chars();
                    match chars.next() {
                        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
                        None => other.to_string(),
                    }
                }
            }
        })
        .collect();
    parts.join("+")
}

// ── Push-to-talk driver ────────────────────────────────────────────────────

fn drive_press(app: &AppHandle, shortcut_key: &str, mode: TriggerMode) {
    log::info!("push-to-talk press: {} (mode={:?})", shortcut_key, mode);

    // The toggle mode needs to know the current state to flip it; read
    // the audio state directly. Hold mode always starts capture on press.
    let is_capturing = app
        .state::<Arc<crate::audio::AudioState>>()
        .capturing
        .load(Ordering::SeqCst);

    let should_start = match mode {
        TriggerMode::Hold => true,
        TriggerMode::Toggle => !is_capturing,
    };

    if should_start {
        if let Err(e) = crate::audio::start_audio_capture(app.clone(), None) {
            log::warn!("start_audio_capture failed: {e}");
            crate::overlay::emit_error(app, &e);
            return;
        }
        crate::overlay::show(app, "recording", "", shortcut_key);
    } else {
        // Toggle: user pressed while already recording — treat as stop.
        log::info!("toggle: stopping capture");
        let _ = crate::audio::stop_audio_capture(app.clone());
        crate::overlay::set_state(app, "transcribing", None);
        let app_for_timer = app.clone();
        let key_str = shortcut_key.to_string();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1400));
            crate::overlay::hide(&app_for_timer);
        });
    }

    let _ = tauri::Emitter::emit(
        app,
        "whisply://shortcut",
        serde_json::json!({
            "key": shortcut_key,
            "state": "pressed",
        }),
    );
}

fn drive_release(app: &AppHandle, shortcut_key: &str, mode: TriggerMode) {
    // In toggle mode, release is a no-op — capture is bounded by the
    // next press instead.
    if mode == TriggerMode::Toggle {
        return;
    }

    log::info!("push-to-talk release: {}", shortcut_key);
    let _ = crate::audio::stop_audio_capture(app.clone());
    crate::overlay::set_state(app, "transcribing", None);
    let app_for_timer = app.clone();
    let key_str = shortcut_key.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1400));
        crate::overlay::hide(&app_for_timer);
    });
    let _ = tauri::Emitter::emit(
        app,
        "whisply://shortcut",
        serde_json::json!({
            "key": key_str,
            "state": "released",
        }),
    );
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// The plugin's listener is installed at builder time, so this is a
/// no-op kept for backwards compatibility with the frontend hook.
#[tauri::command]
pub fn start_shortcut_listener(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

/// Register a new shortcut to listen for. Format: "Ctrl+B", "Super+V", etc.
/// The plugin handles the system-level listening — we just need to
/// convert the string and store the parsed `Shortcut` for later unregister.
///
/// `mode` is optional and defaults to "hold". Pass "toggle" for tap-to-toggle
/// behaviour where the release event is ignored.
#[tauri::command]
pub fn register_shortcut_evdev(
    app: AppHandle,
    shortcut_key: String,
    mode: Option<String>,
) -> Result<(), String> {
    let normalized = normalize_for_plugin(&shortcut_key);
    let parsed: Shortcut = normalized
        .parse()
        .map_err(|e| format!("Couldn't parse shortcut '{shortcut_key}': {e}"))?;

    let trigger_mode = TriggerMode::from_str(mode.as_deref().unwrap_or("hold"));

    // Unregister any prior copy of the same shortcut so we don't end up
    // with two handlers firing for one press.
    let _ = app.global_shortcut().unregister(parsed.clone());

    // Capture the original user-facing string so the event payload stays
    // the same as before (e.g. "Ctrl+CapsLock", not the normalised form).
    let user_key = shortcut_key.clone();
    let app_for_handler = app.clone();
    app.global_shortcut()
        .on_shortcut(parsed.clone(), move |_app, _scut, event| {
            match event.state {
                ShortcutState::Pressed => {
                    drive_press(&app_for_handler, &user_key, trigger_mode)
                }
                ShortcutState::Released => {
                    drive_release(&app_for_handler, &user_key, trigger_mode)
                }
            }
        })
        .map_err(|e| {
            log::error!("global_shortcut on_shortcut failed: {e}");
            format!("Couldn't register shortcut '{shortcut_key}': {e}")
        })?;

    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;
    // Replace any prior entry for the same user-facing string.
    guard.retain(|s| s.key_str != shortcut_key);
    guard.push(RegisteredShortcut {
        key_str: shortcut_key.clone(),
        parsed: parsed.clone(),
        mode: trigger_mode,
    });

    log::info!(
        "Registered shortcut: {} (mode={:?})",
        shortcut_key,
        trigger_mode
    );

    // Mirror to the main app so the Logs page can show it inline.
    let _ = tauri::Emitter::emit(
        &app,
        "whisply://shortcut-registered",
        serde_json::json!({
            "shortcut": shortcut_key,
            "mode": format!("{:?}", trigger_mode).to_lowercase(),
        }),
    );
    Ok(())
}

/// Unregister a specific shortcut.
#[tauri::command]
pub fn unregister_shortcut_evdev(
    app: AppHandle,
    shortcut_key: String,
) -> Result<(), String> {
    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;
    let to_remove: Vec<RegisteredShortcut> = guard
        .iter()
        .filter(|s| s.key_str == shortcut_key)
        .cloned()
        .collect();
    guard.retain(|s| s.key_str != shortcut_key);
    drop(guard);

    for s in to_remove {
        let _ = app.global_shortcut().unregister(s.parsed);
    }
    log::info!("Unregistered shortcut: {}", shortcut_key);
    Ok(())
}

/// Unregister all shortcuts.
#[tauri::command]
pub fn unregister_all_shortcuts_evdev(app: AppHandle) -> Result<(), String> {
    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;
    let drained: Vec<RegisteredShortcut> = guard.drain(..).collect();
    drop(guard);

    for s in drained {
        let _ = app.global_shortcut().unregister(s.parsed);
    }
    log::info!("All shortcuts unregistered");
    Ok(())
}
