use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

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
    Ok(match s.to_lowercase().as_str() {
        "a" => KeyA, "b" => KeyB, "c" => KeyC, "d" => KeyD, "e" => KeyE,
        "f" => KeyF, "g" => KeyG, "h" => KeyH, "i" => KeyI, "j" => KeyJ,
        "k" => KeyK, "l" => KeyL, "m" => KeyM, "n" => KeyN, "o" => KeyO,
        "p" => KeyP, "q" => KeyQ, "r" => KeyR, "s" => KeyS, "t" => KeyT,
        "u" => KeyU, "v" => KeyV, "w" => KeyW, "x" => KeyX, "y" => KeyY, "z" => KeyZ,
        "0" => Num0, "1" => Num1, "2" => Num2, "3" => Num3, "4" => Num4,
        "5" => Num5, "6" => Num6, "7" => Num7, "8" => Num8, "9" => Num9,
        "space" => Space,
        "enter" | "return" => Return,
        "tab" => Tab,
        "escape" | "esc" => Escape,
        "backspace" => Backspace,
        "delete" => Delete,
        "up" => UpArrow, "down" => DownArrow, "left" => LeftArrow, "right" => RightArrow,
        "f1" => F1, "f2" => F2, "f3" => F3, "f4" => F4, "f5" => F5,
        "f6" => F6, "f7" => F7, "f8" => F8, "f9" => F9, "f10" => F10, "f11" => F11, "f12" => F12,
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
                                let _ = app_clone.emit(
                                    "whisply://shortcut",
                                    serde_json::json!({
                                        "key": shortcut.key_str,
                                        "state": "pressed",
                                    }),
                                );
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
                                let _ = app_clone.emit(
                                    "whisply://shortcut",
                                    serde_json::json!({
                                        "key": shortcut.key_str,
                                        "state": "released",
                                    }),
                                );
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
    let (key, mask) = parse_shortcut(&shortcut_key)?;

    let registry = app.state::<ShortcutRegistry>().0.clone();
    let mut guard = registry.lock().map_err(|e| e.to_string())?;

    guard.push(RegisteredShortcut {
        key,
        modifiers: mask,
        key_str: shortcut_key.clone(),
    });

    log::info!("Registered shortcut: {}", shortcut_key);
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
