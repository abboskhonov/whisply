use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(target_os = "linux")]
use evdev::{EventSummary, KeyCode};

// ── State ───────────────────────────────────────────────────────────────────

/// Track the active dictation shortcut for both the X11 plugin and the
/// Wayland evdev listener.
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

#[derive(Clone)]
pub struct RegisteredShortcut {
    /// Canonical string the user configured (e.g. "Ctrl+CapsLock").
    pub key_str: String,
    /// Parsed `Shortcut` from the plugin. Held so we can unregister.
    pub parsed: Shortcut,
    /// Hold (press-and-hold) or toggle (tap to start, tap again to stop).
    pub mode: TriggerMode,
    #[cfg(target_os = "linux")]
    pub evdev_key: KeyCode,
    #[cfg(target_os = "linux")]
    pub modifiers: ModifierMask,
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
                "super" | "meta" | "cmd" | "command" | "win" | "windows" => "Super".to_string(),
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

#[cfg(target_os = "linux")]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ModifierMask {
    ctrl: bool,
    alt: bool,
    shift: bool,
    super_: bool,
}

#[cfg(target_os = "linux")]
fn uses_evdev_backend() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|session| session.eq_ignore_ascii_case("wayland"))
        .unwrap_or_else(|_| std::env::var_os("WAYLAND_DISPLAY").is_some())
}

#[cfg(not(target_os = "linux"))]
fn uses_evdev_backend() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn parse_evdev_shortcut(raw: &str) -> Result<(KeyCode, ModifierMask), String> {
    let mut modifiers = ModifierMask::default();
    let mut key = None;

    for part in raw.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => modifiers.ctrl = true,
            "alt" | "option" => modifiers.alt = true,
            "shift" => modifiers.shift = true,
            "super" | "meta" | "cmd" | "command" | "win" | "windows" => modifiers.super_ = true,
            value => key = Some(evdev_key_from_str(value)?),
        }
    }

    key.map(|key| (key, modifiers))
        .ok_or_else(|| format!("No non-modifier key in '{raw}'"))
}

#[cfg(target_os = "linux")]
fn evdev_key_from_str(value: &str) -> Result<KeyCode, String> {
    use std::str::FromStr;

    if value.len() == 1 && value.as_bytes()[0].is_ascii_alphanumeric() {
        return KeyCode::from_str(&format!("KEY_{}", value.to_ascii_uppercase()))
            .map_err(|_| format!("Unknown key: '{value}'"));
    }

    if value
        .strip_prefix('f')
        .and_then(|number| number.parse::<u8>().ok())
        .is_some_and(|number| (1..=12).contains(&number))
    {
        return KeyCode::from_str(&format!("KEY_{}", value.to_ascii_uppercase()))
            .map_err(|_| format!("Unknown key: '{value}'"));
    }

    let canonical = match value {
        "space" => "KEY_SPACE",
        "enter" | "return" => "KEY_ENTER",
        "tab" => "KEY_TAB",
        "escape" | "esc" => "KEY_ESC",
        "backspace" => "KEY_BACKSPACE",
        "delete" | "del" => "KEY_DELETE",
        "insert" | "ins" => "KEY_INSERT",
        "arrowup" | "up" => "KEY_UP",
        "arrowdown" | "down" => "KEY_DOWN",
        "arrowleft" | "left" => "KEY_LEFT",
        "arrowright" | "right" => "KEY_RIGHT",
        "home" => "KEY_HOME",
        "end" => "KEY_END",
        "pageup" | "pgup" => "KEY_PAGEUP",
        "pagedown" | "pgdn" => "KEY_PAGEDOWN",
        "capslock" | "caps" => "KEY_CAPSLOCK",
        "numlock" => "KEY_NUMLOCK",
        "scrolllock" | "scroll" => "KEY_SCROLLLOCK",
        "printscreen" | "prtsc" => "KEY_SYSRQ",
        "pause" => "KEY_PAUSE",
        "," | "comma" => "KEY_COMMA",
        "." | "period" | "dot" => "KEY_DOT",
        "/" | "slash" => "KEY_SLASH",
        ";" | "semicolon" => "KEY_SEMICOLON",
        "'" | "quote" | "apostrophe" => "KEY_APOSTROPHE",
        "[" | "leftbracket" | "openbracket" => "KEY_LEFTBRACE",
        "]" | "rightbracket" | "closebracket" => "KEY_RIGHTBRACE",
        "\\" | "backslash" => "KEY_BACKSLASH",
        "-" | "minus" | "dash" => "KEY_MINUS",
        "=" | "equal" | "equals" => "KEY_EQUAL",
        "`" | "backquote" | "backtick" | "grave" => "KEY_GRAVE",
        "kp0" | "kp_0" => "KEY_KP0",
        "kp1" | "kp_1" => "KEY_KP1",
        "kp2" | "kp_2" => "KEY_KP2",
        "kp3" | "kp_3" => "KEY_KP3",
        "kp4" | "kp_4" => "KEY_KP4",
        "kp5" | "kp_5" => "KEY_KP5",
        "kp6" | "kp_6" => "KEY_KP6",
        "kp7" | "kp_7" => "KEY_KP7",
        "kp8" | "kp_8" => "KEY_KP8",
        "kp9" | "kp_9" => "KEY_KP9",
        "kpdelete" | "kp_delete" | "kpdecimal" | "kp_dot" => "KEY_KPDOT",
        "kpenter" | "kp_enter" => "KEY_KPENTER",
        "kpplus" | "kp_plus" => "KEY_KPPLUS",
        "kpminus" | "kp_minus" => "KEY_KPMINUS",
        "kpmultiply" | "kp_multiply" => "KEY_KPASTERISK",
        "kpdivide" | "kp_divide" => "KEY_KPSLASH",
        other => return Err(format!("Unknown key: '{other}'")),
    };

    KeyCode::from_str(canonical).map_err(|_| format!("Unknown key: '{value}'"))
}

#[cfg(target_os = "linux")]
fn update_evdev_modifier(modifiers: &mut ModifierMask, key: KeyCode, pressed: bool) -> bool {
    match key {
        KeyCode::KEY_LEFTCTRL | KeyCode::KEY_RIGHTCTRL => modifiers.ctrl = pressed,
        KeyCode::KEY_LEFTALT | KeyCode::KEY_RIGHTALT => modifiers.alt = pressed,
        KeyCode::KEY_LEFTSHIFT | KeyCode::KEY_RIGHTSHIFT => modifiers.shift = pressed,
        KeyCode::KEY_LEFTMETA | KeyCode::KEY_RIGHTMETA => modifiers.super_ = pressed,
        _ => return false,
    }
    true
}

#[cfg(target_os = "linux")]
fn handle_evdev_event(
    app: &AppHandle,
    registry: &Arc<Mutex<Vec<RegisteredShortcut>>>,
    modifiers: &Arc<Mutex<ModifierMask>>,
    key: KeyCode,
    value: i32,
) {
    if value == 2 {
        return;
    }

    if let Ok(mut current) = modifiers.lock() {
        if update_evdev_modifier(&mut current, key, value == 1) {
            return;
        }
    }

    let matches = registry
        .lock()
        .map(|registered| {
            registered
                .iter()
                .filter(|shortcut| {
                    shortcut.evdev_key == key
                        && (value == 0
                            || modifiers
                                .lock()
                                .map(|current| *current == shortcut.modifiers)
                                .unwrap_or(false))
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    for shortcut in matches {
        if value == 1 {
            drive_press(app, &shortcut.key_str, shortcut.mode);
        } else if value == 0 {
            drive_release(app, &shortcut.key_str, shortcut.mode);
        }
    }
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
        if let Err(error) = crate::dictation::start(app, shortcut_key) {
            log::warn!("dictation start failed: {error}");
            crate::overlay::emit_error(app, &error);
            return;
        }
    } else {
        // Toggle: user pressed while already recording — treat as stop.
        log::info!("toggle: stopping capture");
        if let Err(error) = crate::dictation::finish(app) {
            log::warn!("dictation finish failed: {error}");
            crate::overlay::emit_error(app, &error);
        }
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
    if let Err(error) = crate::dictation::finish(app) {
        log::warn!("dictation finish failed: {error}");
        crate::overlay::emit_error(app, &error);
    }
    let _ = tauri::Emitter::emit(
        app,
        "whisply://shortcut",
        serde_json::json!({
            "key": shortcut_key,
            "state": "released",
        }),
    );
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// Start the Wayland evdev listener. X11 and non-Linux platforms keep using
/// Tauri's global-shortcut plugin; its Linux backend is X11-only.
#[tauri::command]
pub fn start_shortcut_listener(app: AppHandle) -> Result<(), String> {
    if !uses_evdev_backend() {
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let running = app.state::<ListenerRunning>().0.clone();
        if running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Ok(());
        }

        let keyboards = evdev::enumerate()
            .filter(|(_, device)| {
                device.supported_keys().is_some_and(|keys| {
                    keys.contains(KeyCode::KEY_A) && keys.contains(KeyCode::KEY_ENTER)
                })
            })
            .collect::<Vec<_>>();

        if keyboards.is_empty() {
            running.store(false, Ordering::SeqCst);
            return Err(
                "No readable keyboard devices found in /dev/input. Grant input-group access, then log out and back in."
                    .to_string(),
            );
        }

        let registry = app.state::<ShortcutRegistry>().0.clone();
        let modifiers = Arc::new(Mutex::new(ModifierMask::default()));
        let keyboard_count = keyboards.len();

        for (path, mut device) in keyboards {
            let app_for_thread = app.clone();
            let registry_for_thread = registry.clone();
            let modifiers_for_thread = modifiers.clone();
            std::thread::spawn(move || loop {
                match device.fetch_events() {
                    Ok(events) => {
                        for event in events {
                            if let EventSummary::Key(_, key, value) = event.destructure() {
                                handle_evdev_event(
                                    &app_for_thread,
                                    &registry_for_thread,
                                    &modifiers_for_thread,
                                    key,
                                    value,
                                );
                            }
                        }
                    }
                    Err(error) => {
                        log::error!("evdev listener for {} stopped: {error}", path.display());
                        break;
                    }
                }
            });
        }

        log::info!("evdev shortcut listener started on {keyboard_count} keyboard device(s)");
    }

    Ok(())
}

/// Register a new shortcut to listen for. Format: "Ctrl+B", "Super+V", etc.
/// Uses evdev on Linux/Wayland and Tauri's global-shortcut plugin elsewhere.
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
    let registry = app.state::<ShortcutRegistry>().0.clone();

    #[cfg(target_os = "linux")]
    let (evdev_key, modifiers) = parse_evdev_shortcut(&shortcut_key)?;

    // Whisply exposes one dictation shortcut. Remove the old binding before
    // replacing it so changing the shortcut cannot leave a ghost handler.
    let previous = {
        let mut guard = registry.lock().map_err(|e| e.to_string())?;
        guard.drain(..).collect::<Vec<_>>()
    };
    for shortcut in previous {
        let _ = app.global_shortcut().unregister(shortcut.parsed);
    }

    if uses_evdev_backend() {
        start_shortcut_listener(app.clone())?;
    } else {
        // Capture the original user-facing string so event payloads keep the
        // value shown in settings rather than the normalized plugin value.
        let user_key = shortcut_key.clone();
        let app_for_handler = app.clone();
        app.global_shortcut()
            .on_shortcut(parsed, move |_app, _scut, event| match event.state {
                ShortcutState::Pressed => drive_press(&app_for_handler, &user_key, trigger_mode),
                ShortcutState::Released => drive_release(&app_for_handler, &user_key, trigger_mode),
            })
            .map_err(|e| {
                log::error!("global_shortcut on_shortcut failed: {e}");
                format!("Couldn't register shortcut '{shortcut_key}': {e}")
            })?;
    }

    let mut guard = registry.lock().map_err(|e| e.to_string())?;
    guard.push(RegisteredShortcut {
        key_str: shortcut_key.clone(),
        parsed,
        mode: trigger_mode,
        #[cfg(target_os = "linux")]
        evdev_key,
        #[cfg(target_os = "linux")]
        modifiers,
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
pub fn unregister_shortcut_evdev(app: AppHandle, shortcut_key: String) -> Result<(), String> {
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

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn parses_wayland_shortcut_and_modifiers() {
        let (key, modifiers) = parse_evdev_shortcut("Super+Shift+V").unwrap();

        assert_eq!(key, KeyCode::KEY_V);
        assert_eq!(
            modifiers,
            ModifierMask {
                shift: true,
                super_: true,
                ..ModifierMask::default()
            }
        );
    }

    #[test]
    fn rejects_shortcut_without_non_modifier_key() {
        assert!(parse_evdev_shortcut("Ctrl+Shift").is_err());
    }
}
