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

pub struct RegisteredShortcut {
    /// Canonical string the user configured (e.g. "Ctrl+CapsLock").
    pub key_str: String,
    /// Parsed `Shortcut` from the plugin. Held so we can unregister.
    pub parsed: Shortcut,
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

fn drive_press(app: &AppHandle, shortcut_key: &str) {
    log::info!("push-to-talk press: {}", shortcut_key);
    // 1. Start audio capture (cpal). The global overlay reads this to
    //    drive the live waveform.
    if let Err(e) = crate::audio::start_audio_capture(app.clone(), None) {
        log::warn!("start_audio_capture failed: {e}");
        crate::overlay::emit_error(app, &e);
        return;
    }
    // 2. Show the overlay window with the active shortcut on the pill.
    crate::overlay::show(app, "recording", "", shortcut_key);
    // 3. Notify the main app so its UI can update too.
    let _ = tauri::Emitter::emit(
        app,
        "whisply://shortcut",
        serde_json::json!({
            "key": shortcut_key,
            "state": "pressed",
        }),
    );
}

fn drive_release(app: &AppHandle, shortcut_key: &str) {
    log::info!("push-to-talk release: {}", shortcut_key);
    // 1. Stop capture.
    let _ = crate::audio::stop_audio_capture(app.clone());
    // 2. Switch the overlay to the transcribing state, then hide it
    //    after a short beat so the user sees the spinner before the
    //    pill pops out.
    crate::overlay::set_state(app, "transcribing", None);
    let app_for_timer = app.clone();
    let key_str = shortcut_key.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1400));
        crate::overlay::hide(&app_for_timer);
    });
    // 3. Notify the main app.
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
#[tauri::command]
pub fn register_shortcut_evdev(
    app: AppHandle,
    shortcut_key: String,
) -> Result<(), String> {
    let normalized = normalize_for_plugin(&shortcut_key);
    let parsed: Shortcut = normalized
        .parse()
        .map_err(|e| format!("Couldn't parse shortcut '{shortcut_key}': {e}"))?;

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
                ShortcutState::Pressed => drive_press(&app_for_handler, &user_key),
                ShortcutState::Released => drive_release(&app_for_handler, &user_key),
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
    });

    log::info!("Registered shortcut: {}", shortcut_key);

    // Mirror to the main app so the Logs page can show it inline.
    let _ = tauri::Emitter::emit(
        &app,
        "whisply://shortcut-registered",
        serde_json::json!({ "shortcut": shortcut_key }),
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
