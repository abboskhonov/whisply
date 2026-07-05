use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

// Local helpers that route the shortcut lifecycle through audio + overlay.
// We keep them as free functions so the listener closure can borrow the
// AppHandle without juggling more captures.
fn drive_press(app: &AppHandle, shortcut: &RegisteredShortcut) {
    log::info!("push-to-talk press: {}", shortcut.key_str);
    // 1. Start audio capture (cpal). The global overlay reads this to
    //    drive the live waveform.
    if let Err(e) = crate::audio::start_audio_capture(app.clone(), None) {
        log::warn!("start_audio_capture failed: {e}");
        crate::overlay::emit_error(app, &e);
        return;
    }
    // 2. Show the overlay window with the active shortcut on the pill.
    crate::overlay::show(app, "recording", "", &shortcut.key_str);
    // 3. Notify the main app so its UI can update too.
    let _ = app.emit(
        "whisply://shortcut",
        serde_json::json!({
            "key": shortcut.key_str,
            "state": "pressed",
        }),
    );
}

fn drive_release(app: &AppHandle, shortcut: &RegisteredShortcut) {
    log::info!("push-to-talk release: {}", shortcut.key_str);
    // 1. Stop capture.
    let _ = crate::audio::stop_audio_capture(app.clone());
    // 2. Switch the overlay to the transcribing state, then hide it
    //    after a short beat so the user sees the spinner before the
    //    pill pops out.
    crate::overlay::set_state(app, "transcribing", None);
    let app_for_timer = app.clone();
    let key_str = shortcut.key_str.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1400));
        crate::overlay::hide(&app_for_timer);
    });
    // 3. Notify the main app.
    let _ = app.emit(
        "whisply://shortcut",
        serde_json::json!({
            "key": key_str,
            "state": "released",
        }),
    );
}

// ── Models ──────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct ModifierMask {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub super_: bool,
}

#[derive(Clone, Debug)]
pub struct RegisteredShortcut {
    pub key: rdev::Key,
    pub modifiers: ModifierMask,
    pub key_str: String,
}

/// Tauri-managed state: the list of shortcuts to listen for.
pub struct ShortcutRegistry(pub Arc<Mutex<Vec<RegisteredShortcut>>>);

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

// ── Parsing ─────────────────────────────────────────────────────────────────

fn parse_shortcut(s: &str) -> Result<(rdev::Key, ModifierMask), String> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.is_empty() {
        return Err("Shortcut string is empty".into());
    }

    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut super_ = false;
    let mut key_part: Option<String> = None;

    for part in &parts {
        let lower = part.to_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" | "option" => alt = true,
            "shift" => shift = true,
            "super" | "meta" | "cmd" | "command" | "win" | "windows" => super_ = true,
            other => key_part = Some(other.to_string()),
        }
    }

    let key_str = key_part.ok_or_else(|| format!("No non-modifier key in '{}'", s))?;
    let key = str_to_rdev_key(&key_str)?;

    Ok((key, ModifierMask { ctrl, alt, shift, super_ }))
}

fn str_to_rdev_key(s: &str) -> Result<rdev::Key, String> {
    use rdev::Key::*;
    // All keys rdev knows about, in the same canonical order they appear
    // in the crate's Key enum. We accept both the lowercase single-char
    // form (from the UI recorder) and the human-friendly name so users
    // can configure either.
    Ok(match s.to_lowercase().as_str() {
        // Letters
        "a" => KeyA, "b" => KeyB, "c" => KeyC, "d" => KeyD, "e" => KeyE,
        "f" => KeyF, "g" => KeyG, "h" => KeyH, "i" => KeyI, "j" => KeyJ,
        "k" => KeyK, "l" => KeyL, "m" => KeyM, "n" => KeyN, "o" => KeyO,
        "p" => KeyP, "q" => KeyQ, "r" => KeyR, "s" => KeyS, "t" => KeyT,
        "u" => KeyU, "v" => KeyV, "w" => KeyW, "x" => KeyX, "y" => KeyY, "z" => KeyZ,
        // Top-row digits
        "0" => Num0, "1" => Num1, "2" => Num2, "3" => Num3, "4" => Num4,
        "5" => Num5, "6" => Num6, "7" => Num7, "8" => Num8, "9" => Num9,
        // Whitespace + editing
        "space" => Space,
        "enter" | "return" => Return,
        "tab" => Tab,
        "escape" | "esc" => Escape,
        "backspace" => Backspace,
        "delete" | "del" => Delete,
        "insert" | "ins" => Insert,
        // Navigation
        "up" | "arrowup" => UpArrow, "down" | "arrowdown" => DownArrow,
        "left" | "arrowleft" => LeftArrow, "right" | "arrowright" => RightArrow,
        "home" => Home, "end" => End,
        "pageup" | "pgup" => PageUp, "pagedown" | "pgdn" => PageDown,
        // Locks + system
        "capslock" | "caps" => CapsLock,
        "numlock" => NumLock,
        "scrolllock" | "scroll" => ScrollLock,
        "printscreen" | "prtsc" => PrintScreen,
        "pause" => Pause,
        // Function keys
        "f1" => F1, "f2" => F2, "f3" => F3, "f4" => F4, "f5" => F5,
        "f6" => F6, "f7" => F7, "f8" => F8, "f9" => F9, "f10" => F10, "f11" => F11, "f12" => F12,
        // Punctuation. Both the literal character (what the browser sends
        // via e.key when the user types it) and a friendlier name.
        "," | "comma" => Comma,
        "." | "period" | "dot" => Dot,
        "/" | "slash" => Slash,
        ";" | "semicolon" => SemiColon,
        "'" | "quote" | "apostrophe" => Quote,
        "[" | "leftbracket" | "openbracket" => LeftBracket,
        "]" | "rightbracket" | "closebracket" => RightBracket,
        "\\" | "backslash" => BackSlash,
        "-" | "minus" | "dash" => Minus,
        "=" | "equal" | "equals" => Equal,
        "`" | "backquote" | "backtick" | "grave" => BackQuote,
        // Numpad
        "kp0" | "kp_0" => Kp0, "kp1" | "kp_1" => Kp1, "kp2" | "kp_2" => Kp2,
        "kp3" | "kp_3" => Kp3, "kp4" | "kp_4" => Kp4, "kp5" | "kp_5" => Kp5,
        "kp6" | "kp_6" => Kp6, "kp7" | "kp_7" => Kp7, "kp8" | "kp_8" => Kp8,
        "kp9" | "kp_9" => Kp9,
        "kpdelete" | "kp_delete" | "kpdecimal" | "kp_dot" => KpDelete,
        "kpenter" | "kp_enter" => KpReturn,
        "kpplus" | "kp_plus" => KpPlus,
        "kpminus" | "kp_minus" => KpMinus,
        "kpmultiply" | "kp_multiply" => KpMultiply,
        "kpdivide" | "kp_divide" => KpDivide,
        other => return Err(format!("Unknown key: '{}'", other)),
    })
}

// ── Modifier tracking helpers ───────────────────────────────────────────────

fn is_modifier_key(k: &rdev::Key) -> bool {
    matches!(k, rdev::Key::ControlLeft | rdev::Key::ControlRight
        | rdev::Key::Alt
        | rdev::Key::ShiftLeft | rdev::Key::ShiftRight
        | rdev::Key::MetaLeft | rdev::Key::MetaRight)
}

fn update_mods(mods: &mut ModifierMask, key: &rdev::Key, pressed: bool) {
    match key {
        rdev::Key::ControlLeft | rdev::Key::ControlRight => mods.ctrl = pressed,
        rdev::Key::Alt => mods.alt = pressed,
        rdev::Key::ShiftLeft | rdev::Key::ShiftRight => mods.shift = pressed,
        rdev::Key::MetaLeft | rdev::Key::MetaRight => mods.super_ = pressed,
        _ => {}
    }
}

fn mods_match(mods: &ModifierMask, target: &ModifierMask) -> bool {
    mods.ctrl == target.ctrl
        && mods.alt == target.alt
        && mods.shift == target.shift
        && mods.super_ == target.super_
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// Start the global keyboard listener thread (evdev via `rdev`).
/// Safe to call multiple times — the listener starts only once.
#[tauri::command]
pub fn start_shortcut_listener(app: AppHandle) -> Result<(), String> {
    let running = app.state::<ListenerRunning>();
    if running.0.load(Ordering::SeqCst) {
        return Ok(()); // Already running
    }
    running.0.store(true, Ordering::SeqCst);

    let registry = app.state::<ShortcutRegistry>().0.clone();
    let app_clone = app.clone();

    thread::spawn(move || {
        let mut mods = ModifierMask {
            ctrl: false,
            alt: false,
            shift: false,
            super_: false,
        };

        if let Err(e) = rdev::listen(move |event| {
            match event.event_type {
                rdev::EventType::KeyPress(key) => {
                    if is_modifier_key(&key) {
                        update_mods(&mut mods, &key, true);
                        return;
                    }

                    // Check against all registered shortcuts
                    if let Ok(guard) = registry.lock() {
                        for shortcut in guard.iter() {
                            if key == shortcut.key && mods_match(&mods, &shortcut.modifiers) {
                                drive_press(&app_clone, shortcut);
                            }
                        }
                    }
                }
                rdev::EventType::KeyRelease(key) => {
                    if is_modifier_key(&key) {
                        update_mods(&mut mods, &key, false);
                        return;
                    }

                    if let Ok(guard) = registry.lock() {
                        for shortcut in guard.iter() {
                            if key == shortcut.key {
                                drive_release(&app_clone, shortcut);
                            }
                        }
                    }
                }
                _ => {}
            }
        }) {
            log::error!("Global keyboard listener failed: {:?}", e);
        }
    });

    log::info!("Global keyboard listener started (evdev/rdev)");
    Ok(())
}

/// Register a new shortcut to listen for. Format: "Ctrl+B", "Super+V", etc.
#[tauri::command]
pub fn register_shortcut_evdev(app: AppHandle, shortcut_key: String) -> Result<(), String> {
    let (key, mask) = parse_shortcut(&shortcut_key).map_err(|e| {
        log::warn!("register_shortcut_evdev parse failed: {e}");
        e
    })?;

    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;

    guard.push(RegisteredShortcut {
        key,
        modifiers: mask,
        key_str: shortcut_key.clone(),
    });

    log::info!("Registered shortcut: {}", shortcut_key);
    // Mirror the registration to the main app so the Logs page can show it
    // alongside the live event stream.
    let _ = app.emit(
        "whisply://shortcut-registered",
        serde_json::json!({ "shortcut": shortcut_key }),
    );
    Ok(())
}

/// Unregister a specific shortcut.
#[tauri::command]
pub fn unregister_shortcut_evdev(app: AppHandle, shortcut_key: String) -> Result<(), String> {
    let (key, _) = parse_shortcut(&shortcut_key)?;

    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;
    guard.retain(|s| s.key != key);

    log::info!("Unregistered shortcut: {}", shortcut_key);
    Ok(())
}

/// Unregister all shortcuts.
#[tauri::command]
pub fn unregister_all_shortcuts_evdev(app: AppHandle) -> Result<(), String> {
    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;
    guard.clear();
    log::info!("All shortcuts unregistered");
    Ok(())
}
