use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

const OVERLAY_LABEL: &str = "recording_overlay";

/// Cached "overlay is enabled" flag. Always true for Whisply — the overlay
/// is the only way the user gets push-to-talk feedback when the app window
/// isn't focused, so we keep it cheap to query from the audio path.
static OVERLAY_READY: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Serialize)]
pub struct OverlayStatePayload {
    pub state: &'static str,
    pub device: String,
    pub shortcut: String,
    pub error: String,
}

/// Bring the overlay window up to the top of the primary monitor and show it.
/// On Linux the compositor placement is sometimes off, so we explicitly set
/// the position from Rust after showing — this also lets us place the
/// overlay even when the main window is minimized.
pub fn show(app: &AppHandle, state: &str, device: &str, shortcut: &str) {
    position_overlay(app);

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

/// Hide the overlay window and tell its UI to reset to idle so the pill
/// pops out cleanly next time.
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

/// Returns true if the overlay window is open and visible. Used by the
/// shortcut handler to avoid toggling the wave when the user is mid-key.
pub fn is_visible(app: &AppHandle) -> bool {
    app.get_webview_window(OVERLAY_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// Mark the overlay as ready (called once the window's webview finishes
/// loading). Future show/hide commands become no-ops if the window is
/// not ready, so we don't crash on a missing event target.
pub fn mark_ready() {
    OVERLAY_READY.store(true, Ordering::SeqCst);
}

pub fn is_ready() -> bool {
    OVERLAY_READY.load(Ordering::SeqCst)
}

fn match_state(s: &str) -> &'static str {
    match s {
        "recording" => "recording",
        "transcribing" => "transcribing",
        "denied" => "denied",
        _ => "idle",
    }
}

/// Place the overlay at the top-center of the primary monitor. We compute
/// the position from the monitor's size (logical pixels) so the pill is
/// visible regardless of which display the user is on.
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

    // Window is 420x120 logical. Center horizontally, 12px from the top
    // edge of the monitor (in physical pixels for crisp placement).
    let win_w = (420.0 * scale) as i32;
    let win_h = (120.0 * scale) as i32;

    let x = mon_pos.x + (mon_size.width as i32 - win_w) / 2;
    let y = mon_pos.y + (12 * scale as i32);

    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x,
        y,
    }));
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: win_w as u32,
        height: win_h as u32,
    }));
}
