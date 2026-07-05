use enigo::{Enigo, Keyboard, Settings};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

/// Wrapper for Enigo to store in Tauri's managed state.
pub struct EnigoState(pub Mutex<Enigo>);

impl EnigoState {
    pub fn new() -> Result<Self, String> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("Failed to initialize enigo: {}", e))?;
        Ok(Self(Mutex::new(enigo)))
    }
}

/// Initialize keyboard/mouse simulation.
/// On Wayland this will likely fail; the frontend should treat it as
/// best-effort and fall back to clipboard-based insertion.
#[tauri::command]
pub fn initialize_input(app: AppHandle) -> Result<(), String> {
    if app.try_state::<EnigoState>().is_some() {
        log::info!("Enigo already initialized");
        return Ok(());
    }

    match EnigoState::new() {
        Ok(state) => {
            app.manage(state);
            log::info!("Enigo initialized successfully");
            Ok(())
        }
        Err(e) => {
            log::warn!("Failed to initialize Enigo: {} (text insertion will use clipboard fallback)", e);
            Err(format!("Input system unavailable: {}", e))
        }
    }
}

/// Test that enigo can actually send keys by simulating a simple modifier key.
/// This is a more thorough check than just initialization — the display server
/// (especially Wayland) may reject the attempt at runtime.
#[tauri::command]
pub fn test_input_connection(app: AppHandle) -> Result<bool, String> {
    let state = app.state::<EnigoState>();
    let mut enigo = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Try pressing and releasing the Shift key as a connectivity test
    #[cfg(target_os = "linux")]
    {
        enigo
            .key(enigo::Key::Shift, enigo::Direction::Press)
            .map_err(|e| format!("Key press failed: {}", e))?;
        std::thread::sleep(std::time::Duration::from_millis(30));
        enigo
            .key(enigo::Key::Shift, enigo::Direction::Release)
            .map_err(|e| format!("Key release failed: {}", e))?;
    }

    Ok(true)
}
