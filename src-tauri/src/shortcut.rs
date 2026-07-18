use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(target_os = "linux")]
use handy_keys::{Hotkey, HotkeyId, HotkeyManager, HotkeyState};
#[cfg(target_os = "linux")]
use std::sync::mpsc::{self, Sender};

// ── State ───────────────────────────────────────────────────────────────────

/// Track the active dictation shortcut for the platform shortcut backend.
pub struct ShortcutRegistry {
    shortcuts: Arc<Mutex<Vec<RegisteredShortcut>>>,
    /// Wayland shortcuts must be intercepted rather than merely observed so
    /// the focused app cannot receive the same key combination.
    #[cfg(target_os = "linux")]
    exclusive_sender: Mutex<Option<Sender<ExclusiveCommand>>>,
}

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
}

impl ShortcutRegistry {
    pub fn new() -> Self {
        Self {
            shortcuts: Arc::new(Mutex::new(Vec::new())),
            #[cfg(target_os = "linux")]
            exclusive_sender: Mutex::new(None),
        }
    }

    #[cfg(target_os = "linux")]
    fn exclusive_sender(&self, app: AppHandle) -> Result<Sender<ExclusiveCommand>, String> {
        let mut sender = self
            .exclusive_sender
            .lock()
            .map_err(|error| error.to_string())?;
        if let Some(sender) = sender.as_ref() {
            return Ok(sender.clone());
        }

        let (command_sender, command_receiver) = mpsc::channel();
        let (ready_sender, ready_receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let manager = match HotkeyManager::new_with_blocking() {
                Ok(manager) => {
                    let _ = ready_sender.send(Ok(()));
                    manager
                }
                Err(error) => {
                    let _ = ready_sender.send(Err(error.to_string()));
                    return;
                }
            };
            run_exclusive_shortcut_manager(manager, command_receiver, app);
        });

        match ready_receiver
            .recv()
            .map_err(|_| "Exclusive shortcut listener failed to start".to_string())?
        {
            Ok(()) => {
                *sender = Some(command_sender.clone());
                Ok(command_sender)
            }
            Err(error) => Err(format!(
                "Couldn't enable exclusive Wayland shortcuts: {error}"
            )),
        }
    }

    #[cfg(target_os = "linux")]
    fn replace_exclusive_shortcut(
        &self,
        app: AppHandle,
        hotkey: Hotkey,
        key_str: String,
        mode: TriggerMode,
    ) -> Result<(), String> {
        let sender = self.exclusive_sender(app)?;
        let (response_sender, response_receiver) = mpsc::channel();
        sender
            .send(ExclusiveCommand::Replace {
                hotkey,
                key_str,
                mode,
                response: response_sender,
            })
            .map_err(|_| "Exclusive shortcut listener stopped unexpectedly".to_string())?;
        response_receiver
            .recv()
            .map_err(|_| "Exclusive shortcut listener stopped unexpectedly".to_string())?
    }

    #[cfg(target_os = "linux")]
    fn clear_exclusive_shortcut(&self) -> Result<(), String> {
        let sender = match self
            .exclusive_sender
            .lock()
            .map_err(|error| error.to_string())?
            .as_ref()
        {
            Some(sender) => sender.clone(),
            None => return Ok(()),
        };
        let (response_sender, response_receiver) = mpsc::channel();
        sender
            .send(ExclusiveCommand::Clear {
                response: response_sender,
            })
            .map_err(|_| "Exclusive shortcut listener stopped unexpectedly".to_string())?;
        response_receiver
            .recv()
            .map_err(|_| "Exclusive shortcut listener stopped unexpectedly".to_string())?
    }

    #[cfg(target_os = "linux")]
    fn set_exclusive_cancel(&self, enabled: bool) -> Result<(), String> {
        let sender = match self
            .exclusive_sender
            .lock()
            .map_err(|error| error.to_string())?
            .as_ref()
        {
            Some(sender) => sender.clone(),
            None => return Ok(()),
        };
        // Dictation can enable or disable Escape from the shortcut manager's
        // own event thread. Queue the change instead of waiting for a reply,
        // otherwise that thread would deadlock waiting on itself.
        sender
            .send(ExclusiveCommand::SetCancel { enabled })
            .map_err(|_| "Exclusive shortcut listener stopped unexpectedly".to_string())
    }
}

#[cfg(target_os = "linux")]
enum ExclusiveCommand {
    Replace {
        hotkey: Hotkey,
        key_str: String,
        mode: TriggerMode,
        response: Sender<Result<(), String>>,
    },
    Clear {
        response: Sender<Result<(), String>>,
    },
    SetCancel {
        enabled: bool,
    },
}

/// Owns the blocking `handy-keys` manager on one thread. The library grabs
/// physical keyboards, consumes registered hotkeys, and re-injects every
/// other event through uinput.
#[cfg(target_os = "linux")]
fn run_exclusive_shortcut_manager(
    manager: HotkeyManager,
    commands: mpsc::Receiver<ExclusiveCommand>,
    app: AppHandle,
) {
    let mut active: Option<(HotkeyId, String, TriggerMode)> = None;
    let mut cancel: Option<HotkeyId> = None;

    loop {
        while let Some(event) = manager.try_recv() {
            if Some(event.id) == cancel {
                if event.state == HotkeyState::Pressed {
                    crate::dictation::cancel_pending(&app);
                }
                continue;
            }
            if let Some((id, key_str, mode)) = &active {
                if event.id == *id {
                    match event.state {
                        HotkeyState::Pressed => drive_press(&app, key_str, *mode),
                        HotkeyState::Released => drive_release(&app, key_str, *mode),
                    }
                }
            }
        }

        match commands.recv_timeout(std::time::Duration::from_millis(10)) {
            Ok(ExclusiveCommand::Replace {
                hotkey,
                key_str,
                mode,
                response,
            }) => {
                if let Some((id, _, _)) = active.take() {
                    let _ = manager.unregister(id);
                }
                let result = manager.register(hotkey).map_or_else(
                    |error| Err(format!("Couldn't register exclusive shortcut: {error}")),
                    |id| {
                        active = Some((id, key_str, mode));
                        Ok(())
                    },
                );
                let _ = response.send(result);
            }
            Ok(ExclusiveCommand::Clear { response }) => {
                if let Some((id, _, _)) = active.take() {
                    let _ = manager.unregister(id);
                }
                let _ = response.send(Ok(()));
            }
            Ok(ExclusiveCommand::SetCancel { enabled }) => {
                let result = if enabled && cancel.is_none() {
                    "Escape"
                        .parse::<Hotkey>()
                        .map_err(|error| error.to_string())
                        .and_then(|hotkey| {
                            manager
                                .register(hotkey)
                                .map(|id| cancel = Some(id))
                                .map_err(|error| error.to_string())
                        })
                } else if !enabled {
                    if let Some(id) = cancel.take() {
                        let _ = manager.unregister(id);
                    }
                    Ok(())
                } else {
                    Ok(())
                };
                if let Err(error) = result {
                    log::warn!("could not update Escape dictation cancellation: {error}");
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// Escape is only captured while a completed recording is being transcribed.
/// Keeping it temporary avoids stealing Escape from the user's active app.
pub fn enable_cancel_shortcut(app: &AppHandle, _generation: u64) {
    #[cfg(target_os = "linux")]
    if uses_evdev_backend() {
        if let Err(error) = app.state::<ShortcutRegistry>().set_exclusive_cancel(true) {
            log::warn!("could not enable Escape dictation cancellation: {error}");
        }
        return;
    }

    let shortcut: Shortcut = match "Escape".parse() {
        Ok(shortcut) => shortcut,
        Err(error) => {
            log::warn!("could not parse dictation cancel shortcut: {error}");
            return;
        }
    };
    if let Err(error) = app
        .global_shortcut()
        .on_shortcut(shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                crate::dictation::cancel_pending(app);
            }
        })
    {
        log::warn!("could not enable Escape dictation cancellation: {error}");
    }
}

pub fn disable_cancel_shortcut(app: &AppHandle) {
    #[cfg(target_os = "linux")]
    if uses_evdev_backend() {
        if let Err(error) = app.state::<ShortcutRegistry>().set_exclusive_cancel(false) {
            log::warn!("could not disable Escape dictation cancellation: {error}");
        }
        return;
    }

    if let Ok(shortcut) = "Escape".parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

// ── String → Shortcut conversion ────────────────────────────────────────────

/// Convert our combo format ("Super+V", "Ctrl+CapsLock") to the format
/// `tauri-plugin-global-shortcut` expects.
fn normalize_for_plugin(raw: &str) -> String {
    let parts: Vec<String> = raw
        .split('+')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| match p.to_lowercase().as_str() {
            "ctrl" | "control" => "Ctrl".to_string(),
            "alt" | "option" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "super" | "meta" | "cmd" | "command" | "win" | "windows" => "Super".to_string(),
            other => {
                let mut chars = other.chars();
                match chars.next() {
                    Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
                    None => other.to_string(),
                }
            }
        })
        .collect();
    parts.join("+")
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

// ── Push-to-talk driver ────────────────────────────────────────────────────

fn drive_press(app: &AppHandle, shortcut_key: &str, mode: TriggerMode) {
    log::info!("push-to-talk press: {} (mode={:?})", shortcut_key, mode);

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

/// Kept for callers that probe shortcut availability. The exclusive Wayland
/// listener starts only after a shortcut has been successfully registered.
#[tauri::command]
pub fn start_shortcut_listener(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

/// Register a new shortcut. Wayland uses an exclusive `handy-keys` listener;
/// X11 and non-Linux platforms use Tauri's global-shortcut plugin.
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

    #[cfg(target_os = "linux")]
    let exclusive_hotkey: Option<Hotkey> = if uses_evdev_backend() {
        Some(
            shortcut_key
                .parse()
                .map_err(|error| format!("Couldn't parse shortcut '{shortcut_key}': {error}"))?,
        )
    } else {
        None
    };

    let registry = app.state::<ShortcutRegistry>();
    let previous = {
        let mut guard = registry.shortcuts.lock().map_err(|e| e.to_string())?;
        guard.drain(..).collect::<Vec<_>>()
    };
    for shortcut in previous {
        let _ = app.global_shortcut().unregister(shortcut.parsed);
    }

    #[cfg(target_os = "linux")]
    if let Some(hotkey) = exclusive_hotkey {
        registry.replace_exclusive_shortcut(
            app.clone(),
            hotkey,
            shortcut_key.clone(),
            trigger_mode,
        )?;
    } else {
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

    #[cfg(not(target_os = "linux"))]
    {
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

    let mut guard = registry.shortcuts.lock().map_err(|e| e.to_string())?;
    guard.push(RegisteredShortcut {
        key_str: shortcut_key.clone(),
        parsed,
    });

    log::info!(
        "Registered shortcut: {} (mode={:?})",
        shortcut_key,
        trigger_mode
    );
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
    let registry = app.state::<ShortcutRegistry>();
    let mut guard = registry.shortcuts.lock().map_err(|e| e.to_string())?;
    let to_remove: Vec<RegisteredShortcut> = guard
        .iter()
        .filter(|shortcut| shortcut.key_str == shortcut_key)
        .cloned()
        .collect();
    guard.retain(|shortcut| shortcut.key_str != shortcut_key);
    drop(guard);

    for shortcut in to_remove {
        let _ = app.global_shortcut().unregister(shortcut.parsed);
    }
    #[cfg(target_os = "linux")]
    if uses_evdev_backend() {
        registry.clear_exclusive_shortcut()?;
    }
    log::info!("Unregistered shortcut: {}", shortcut_key);
    Ok(())
}

/// Unregister all shortcuts.
#[tauri::command]
pub fn unregister_all_shortcuts_evdev(app: AppHandle) -> Result<(), String> {
    let registry = app.state::<ShortcutRegistry>();
    let mut guard = registry.shortcuts.lock().map_err(|e| e.to_string())?;
    let drained: Vec<RegisteredShortcut> = guard.drain(..).collect();
    drop(guard);

    for shortcut in drained {
        let _ = app.global_shortcut().unregister(shortcut.parsed);
    }
    #[cfg(target_os = "linux")]
    if uses_evdev_backend() {
        registry.clear_exclusive_shortcut()?;
    }
    log::info!("All shortcuts unregistered");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_for_plugin;

    #[test]
    fn normalizes_shortcut_modifier_aliases() {
        assert_eq!(
            normalize_for_plugin("control + option + space"),
            "Ctrl+Alt+Space"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn parses_exclusive_ctrl_space_shortcut() {
        let _: handy_keys::Hotkey = "Ctrl+Space".parse().unwrap();
    }
}
