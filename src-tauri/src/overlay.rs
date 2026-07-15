use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "linux")]
use gtk_layer_shell::{Edge, Layer, LayerShell};

const OVERLAY_LABEL: &str = "recording_overlay";
const OVERLAY_WIDTH: f64 = 420.0;
const OVERLAY_HEIGHT: f64 = 120.0;

/// Pending overlay state to show once the webview is ready.
static PENDING_STATE: Mutex<Option<PendingOverlay>> = Mutex::new(None);
static OVERLAY_READY: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "linux")]
static LAYER_SHELL_INITIALIZED: AtomicBool = AtomicBool::new(false);

struct PendingOverlay {
    state: String,
    device: String,
    shortcut: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct OverlayStatePayload {
    pub state: &'static str,
    pub device: String,
    pub shortcut: String,
    pub error: String,
}

/// Initialize GTK layer shell for the overlay window (Linux/Wayland).
/// This makes the overlay truly topmost, which `always_on_top` alone
/// cannot guarantee on Wayland compositors like Mutter/GNOME.
#[cfg(target_os = "linux")]
fn init_layer_shell(window: &tauri::WebviewWindow) {
    // GTK calls must stay on the setup thread. Mark the attempt even when the
    // compositor has no layer-shell support so shortcut worker threads never
    // retry GTK initialization later.
    if LAYER_SHELL_INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let Ok(gtk_window) = window.gtk_window() else {
        log::warn!("gtk_window() failed — layer shell not available");
        return;
    };

    if !gtk_layer_shell::is_supported() {
        log::debug!("gtk-layer-shell not supported by compositor");
        return;
    }

    gtk_window.init_layer_shell();
    gtk_window.set_layer(Layer::Overlay);
    gtk_window.set_keyboard_mode(gtk_layer_shell::KeyboardMode::None);
    gtk_window.set_exclusive_zone(0);
    // With no horizontal anchor, layer-shell centers the fixed-width surface.
    gtk_window.set_anchor(Edge::Top, true);

    log::info!("GTK layer shell initialized for overlay (Layer::Overlay)");
}

#[cfg(not(target_os = "linux"))]
fn init_layer_shell(_window: &tauri::WebviewWindow) {}

/// Ensure the overlay webview exists. Creates it on first call.
/// On Linux, also initialises GTK layer shell for proper Wayland
/// always-on-top behaviour.
pub fn ensure_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        init_layer_shell(&window);
        return;
    }

    log::info!("Creating recording_overlay window at runtime");
    let url = WebviewUrl::App("overlay.html".into());
    let window = WebviewWindowBuilder::new(app, OVERLAY_LABEL, url)
        .title("Whisply Overlay")
        .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focusable(false)
        .focused(false)
        .visible(false)
        .shadow(false)
        .center()
        .build();

    if let Ok(ref w) = window {
        #[cfg(target_os = "linux")]
        init_layer_shell(w);
        log::info!("recording_overlay window created");
    } else if let Err(e) = window {
        log::error!("Failed to create recording_overlay window: {e}");
    }
}

/// Position the overlay at the top-center of the primary monitor.
fn position_overlay(app: &AppHandle) {
    let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };

    let monitor = match app.primary_monitor().ok().flatten() {
        Some(m) => m,
        None => return,
    };

    let scale = monitor.scale_factor();
    let mon_size = monitor.size();
    let mon_pos = monitor.position();

    let win_w = (OVERLAY_WIDTH * scale) as i32;
    let win_h = (OVERLAY_HEIGHT * scale) as i32;

    let x = mon_pos.x + (mon_size.width as i32 - win_w) / 2;
    let y = mon_pos.y + (12.0 * scale) as i32;

    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: win_w as u32,
        height: win_h as u32,
    }));
}

/// Mark the overlay webview as ready. Called from `on_page_load`.
/// If there's a pending show state, applies it immediately.
pub fn mark_ready(app: &AppHandle) {
    OVERLAY_READY.store(true, Ordering::SeqCst);
    log::info!("recording_overlay webview marked ready");

    // Drain any pending state that arrived before the webview was loaded.
    let pending = PENDING_STATE.lock().ok().and_then(|mut p| p.take());
    if let Some(p) = pending {
        log::info!("Applying deferred overlay state: {}", p.state);
        // Re-emit state now that the webview listener is up.
        let _ = app.emit_to(
            OVERLAY_LABEL,
            "whisply://audio-state",
            OverlayStatePayload {
                state: match_state(&p.state),
                device: p.device,
                shortcut: p.shortcut,
                error: String::new(),
            },
        );
    }
}

#[tauri::command]
pub fn overlay_ready(app: AppHandle) {
    mark_ready(&app);
}

fn match_state(s: &str) -> &'static str {
    match s {
        "recording" => "recording",
        "transcribing" => "transcribing",
        "denied" => "denied",
        _ => "idle",
    }
}

/// Show the overlay with the given state. Emits the state event to the
/// overlay webview and makes the window visible.
///
/// If the overlay webview hasn't finished loading yet, the state is
/// stashed and applied once `mark_ready()` fires. This prevents the
/// "shortcut pressed before overlay loaded" race.
pub fn show(app: &AppHandle, state: &str, device: &str, shortcut: &str) {
    ensure_window(app);
    position_overlay(app);

    let ready = OVERLAY_READY.load(Ordering::SeqCst);

    if !ready {
        // Stash the state for when the webview finishes loading.
        if let Ok(mut pending) = PENDING_STATE.lock() {
            *pending = Some(PendingOverlay {
                state: state.to_string(),
                device: device.to_string(),
                shortcut: shortcut.to_string(),
            });
        }
        log::info!(
            "Overlay not ready yet — stashed state '{}' for later",
            state
        );

        // Still show the window even if the webview isn't ready.
        // The event will be re-emitted when mark_ready fires.
        if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
            let _ = window.show();
        }
        return;
    }

    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.show();
    }

    let _ = app.emit_to(
        OVERLAY_LABEL,
        "whisply://audio-state",
        OverlayStatePayload {
            state: match_state(state),
            device: device.to_string(),
            shortcut: shortcut.to_string(),
            error: String::new(),
        },
    );
}

/// Hide the overlay window and reset the UI to idle.
pub fn hide(app: &AppHandle) {
    let _ = app.emit_to(
        OVERLAY_LABEL,
        "whisply://audio-state",
        OverlayStatePayload {
            state: "idle",
            device: String::new(),
            shortcut: String::new(),
            error: String::new(),
        },
    );

    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }
}

/// Push a state transition (e.g. recording → transcribing) without hiding.
pub fn set_state(app: &AppHandle, state: &str, error: Option<&str>) {
    let _ = app.emit_to(
        OVERLAY_LABEL,
        "whisply://audio-state",
        OverlayStatePayload {
            state: match_state(state),
            device: String::new(),
            shortcut: String::new(),
            error: error.unwrap_or("").to_string(),
        },
    );
}

pub fn emit_error(app: &AppHandle, message: &str) {
    ensure_window(app);
    position_overlay(app);
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.show();
    }

    let _ = app.emit_to(
        OVERLAY_LABEL,
        "whisply://audio-state",
        OverlayStatePayload {
            state: "denied",
            device: String::new(),
            shortcut: String::new(),
            error: message.to_string(),
        },
    );
}
