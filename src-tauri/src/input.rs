use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "linux")]
use evdev::{uinput::VirtualDevice, AttributeSet, InputEvent, KeyCode};

pub struct InputState {
    enigo: Mutex<Option<Enigo>>,
    clipboard: Mutex<Option<Clipboard>>,
    #[cfg(target_os = "linux")]
    uinput: Mutex<Option<VirtualDevice>>,
}

impl InputState {
    pub fn new() -> Self {
        Self {
            enigo: Mutex::new(None),
            clipboard: Mutex::new(None),
            #[cfg(target_os = "linux")]
            uinput: Mutex::new(None),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct InsertionResult {
    pub method: String,
}

#[cfg(target_os = "linux")]
fn create_uinput_keyboard() -> Result<VirtualDevice, String> {
    let mut keys = AttributeSet::<KeyCode>::new();
    // systemd/libinput only classifies a uinput device as a keyboard when it
    // advertises the standard key block (Esc through D). A Ctrl+V-only device
    // accepts writes but GNOME ignores it as a non-keyboard input device.
    for code in 1..=31 {
        keys.insert(KeyCode(code));
    }
    keys.insert(KeyCode::KEY_V);
    VirtualDevice::builder()
        .map_err(|error| format!("Could not open /dev/uinput: {error}"))?
        .name("Whisply Text Insertion")
        .with_keys(&keys)
        .map_err(|error| format!("Could not configure virtual keyboard: {error}"))?
        .build()
        .map_err(|error| format!("Could not create virtual keyboard: {error}"))
}

#[cfg(target_os = "linux")]
fn ydotool_socket() -> Option<PathBuf> {
    std::env::var_os("YDOTOOL_SOCKET")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("XDG_RUNTIME_DIR").map(|dir| PathBuf::from(dir).join(".ydotool_socket")))
}

#[cfg(target_os = "linux")]
fn command_exists(name: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|paths| {
        std::env::split_paths(&paths).any(|directory| directory.join(name).is_file())
    })
}

#[cfg(target_os = "linux")]
fn ydotool_available() -> bool {
    command_exists("ydotool") && ydotool_socket().is_some_and(|socket| socket.exists())
}

#[cfg(target_os = "linux")]
fn paste_with_ydotool() -> Result<(), String> {
    let socket = ydotool_socket().ok_or_else(|| "ydotool socket was not found".to_string())?;
    let status = Command::new("ydotool")
        .args(["key", "29:1", "47:1", "47:0", "29:0"])
        .env("YDOTOOL_SOCKET", socket)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("Could not run ydotool: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("ydotool exited with {status}"))
    }
}

#[cfg(target_os = "linux")]
fn paste_with_uinput(device: &mut VirtualDevice) -> Result<(), String> {
    let key = |code: KeyCode, value| InputEvent::new(evdev::EventType::KEY.0, code.code(), value);
    device
        .emit(&[key(KeyCode::KEY_LEFTCTRL, 1)])
        .map_err(|error| format!("Could not press Control: {error}"))?;
    std::thread::sleep(Duration::from_millis(20));
    device
        .emit(&[key(KeyCode::KEY_V, 1)])
        .map_err(|error| format!("Could not press V: {error}"))?;
    std::thread::sleep(Duration::from_millis(20));
    device
        .emit(&[key(KeyCode::KEY_V, 0)])
        .map_err(|error| format!("Could not release V: {error}"))?;
    std::thread::sleep(Duration::from_millis(12));
    device
        .emit(&[key(KeyCode::KEY_LEFTCTRL, 0)])
        .map_err(|error| format!("Could not release Control: {error}"))
}

#[cfg(target_os = "linux")]
fn wayland_clipboard_available() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some() && command_exists("wl-copy")
}

#[cfg(target_os = "linux")]
fn set_wayland_clipboard(text: &str) -> Result<(), String> {
    if !wayland_clipboard_available() {
        return Err("Wayland clipboard helper is unavailable".to_string());
    }

    // wl-copy owns and serves the selection, so waiting for it here blocks
    // until clipboard ownership changes. Keep it in the foreground and reap
    // it asynchronously. Do not use --paste-once: GNOME's clipboard manager
    // may consume that one request before the target application's Ctrl+V.
    let mut child = Command::new("wl-copy")
        .args(["--foreground", "--type", "text/plain;charset=utf-8"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start wl-copy: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "wl-copy stdin was unavailable".to_string())?
        .write_all(text.as_bytes())
        .map_err(|error| format!("Could not send text to wl-copy: {error}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    // The Wayland selection is registered asynchronously. Confirm that this
    // process owns the expected payload before emitting Ctrl+V instead of
    // relying on an arbitrary short sleep under system load.
    for _ in 0..40 {
        if Command::new("wl-paste")
            .arg("-n")
            .output()
            .is_ok_and(|output| output.status.success() && output.stdout == text.as_bytes())
        {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    Err("Wayland clipboard did not become ready in time".to_string())
}

fn paste_with_enigo(enigo: &mut Enigo) -> Result<(), String> {
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|error| error.to_string())?;
    let click = enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|error| error.to_string());
    let release = enigo
        .key(Key::Control, Direction::Release)
        .map_err(|error| error.to_string());
    click.and(release)
}

/// Initialize clipboard and keyboard injection while onboarding can still show
/// actionable permission errors.
#[tauri::command]
pub fn initialize_input(app: AppHandle) -> Result<(), String> {
    let state = app.state::<InputState>();

    #[cfg(target_os = "linux")]
    let needs_arboard = !wayland_clipboard_available();
    #[cfg(not(target_os = "linux"))]
    let needs_arboard = true;

    if needs_arboard {
        let mut clipboard = state.clipboard.lock().map_err(|error| error.to_string())?;
        if clipboard.is_none() {
            *clipboard = Some(
                Clipboard::new().map_err(|error| format!("Clipboard unavailable: {error}"))?,
            );
        }
    }

    #[cfg(target_os = "linux")]
    if ydotool_available() {
        log::info!("ydotool text insertion ready");
    } else {
        let mut uinput = state.uinput.lock().map_err(|error| error.to_string())?;
        if uinput.is_none() {
            match create_uinput_keyboard() {
                Ok(device) => {
                    *uinput = Some(device);
                    // Allow udev/libinput to classify and attach the new device.
                    std::thread::sleep(Duration::from_millis(500));
                    log::info!("uinput text insertion ready");
                }
                Err(error) => log::warn!("{error}; trying Enigo fallback"),
            }
        }
    }

    #[cfg(target_os = "linux")]
    let needs_enigo = !ydotool_available()
        && state
            .uinput
            .lock()
            .map_err(|error| error.to_string())?
            .is_none();
    #[cfg(not(target_os = "linux"))]
    let needs_enigo = true;

    if needs_enigo {
        let mut enigo = state.enigo.lock().map_err(|error| error.to_string())?;
        if enigo.is_none() {
            match Enigo::new(&Settings::default()) {
                Ok(instance) => *enigo = Some(instance),
                Err(error) => log::warn!("Enigo fallback unavailable: {error}"),
            }
        }
        if enigo.is_none() {
            return Err("No keyboard insertion backend is available".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn test_input_connection(app: AppHandle) -> Result<bool, String> {
    initialize_input(app).map(|_| true)
}

pub fn insert_text_locally(app: &AppHandle, text: &str) -> Result<InsertionResult, String> {
    if text.trim().is_empty() {
        return Err("Nothing was transcribed".to_string());
    }

    initialize_input(app.clone())?;
    let state = app.state::<InputState>();
    let clipboard_method = {
        #[cfg(target_os = "linux")]
        if set_wayland_clipboard(text).is_ok() {
            "wayland-clipboard"
        } else {
            let mut clipboard = state.clipboard.lock().map_err(|error| error.to_string())?;
            if clipboard.is_none() {
                *clipboard = Some(
                    Clipboard::new().map_err(|error| format!("Clipboard unavailable: {error}"))?,
                );
            }
            clipboard
                .as_mut()
                .expect("clipboard initialized")
                .set_text(text.to_string())
                .map_err(|error| format!("Could not copy transcript: {error}"))?;
            "clipboard"
        }
        #[cfg(not(target_os = "linux"))]
        {
            let mut clipboard = state.clipboard.lock().map_err(|error| error.to_string())?;
            clipboard
                .as_mut()
                .ok_or_else(|| "Clipboard is not initialized".to_string())?
                .set_text(text.to_string())
                .map_err(|error| format!("Could not copy transcript: {error}"))?;
            "clipboard"
        }
    };
    // Give Wayland/X11 clipboard ownership a moment to propagate before paste.
    std::thread::sleep(Duration::from_millis(80));

    #[cfg(target_os = "linux")]
    {
        if ydotool_available() {
            match paste_with_ydotool() {
                Ok(()) => {
                    let method = format!("{clipboard_method}+ydotool");
                    log::info!("inserted {} transcript characters via {method}", text.chars().count());
                    return Ok(InsertionResult { method });
                }
                Err(error) => log::warn!("{error}; trying uinput fallback"),
            }
        }

        let mut uinput = state.uinput.lock().map_err(|error| error.to_string())?;
        if let Some(device) = uinput.as_mut() {
            paste_with_uinput(device)?;
            let method = format!("{clipboard_method}+uinput");
            log::info!("inserted {} transcript characters via {method}", text.chars().count());
            return Ok(InsertionResult { method });
        }
    }

    let mut enigo = state.enigo.lock().map_err(|error| error.to_string())?;
    let enigo = enigo
        .as_mut()
        .ok_or_else(|| "No text insertion backend is available".to_string())?;
    paste_with_enigo(enigo)?;
    let method = format!("{clipboard_method}+enigo");
    log::info!("inserted {} transcript characters via {method}", text.chars().count());
    Ok(InsertionResult { method })
}

#[tauri::command]
pub fn insert_text(app: AppHandle, text: String) -> Result<InsertionResult, String> {
    insert_text_locally(&app, &text)
}
