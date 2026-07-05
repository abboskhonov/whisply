use enigo::{Enigo, Settings};
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

/// Check whether enigo was initialized successfully (passive test —
/// does NOT send actual keys, avoiding Wayland/GNOME security dialogs).
#[tauri::command]
pub fn test_input_connection(app: AppHandle) -> Result<bool, String> {
    let state = app
        .try_state::<EnigoState>()
        .ok_or_else(|| "Enigo not initialized".to_string())?;
    let _enigo = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(true)
}
