use log::info;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Register a global shortcut. When pressed, emits a `whisply://shortcut` event
/// to the frontend. When released (for push-to-talk), emits a separate event.
#[tauri::command]
pub fn register_global_shortcut(app: AppHandle, shortcut_key: String) -> Result<(), String> {
    // Parse the shortcut string (e.g. "Ctrl+Y", "Super+V", "Alt+Space")
    let shortcut: Shortcut = shortcut_key
        .parse()
        .map_err(|e| format!("Invalid shortcut '{}': {:?}", shortcut_key, e))?;

    // Prevent duplicate registrations
    if app.global_shortcut().is_registered(shortcut) {
        info!("Shortcut '{}' is already registered", shortcut_key);
        return Ok(());
    }

    let key_for_event = shortcut_key.clone();

    app.global_shortcut()
        .on_shortcut(shortcut, move |app_handle, _scut, event| {
            let state = match event.state {
                ShortcutState::Pressed => "pressed",
                ShortcutState::Released => "released",
            };

            let _ = app_handle.emit(
                "whisply://shortcut",
                serde_json::json!({
                    "key": key_for_event,
                    "state": state,
                }),
            );
        })
        .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut_key, e))?;

    info!("Registered global shortcut: {}", shortcut_key);
    Ok(())
}

/// Unregister a global shortcut.
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle, shortcut_key: String) -> Result<(), String> {
    let shortcut: Shortcut = shortcut_key
        .parse()
        .map_err(|e| format!("Invalid shortcut '{}': {:?}", shortcut_key, e))?;

    app.global_shortcut()
        .unregister(shortcut)
        .map_err(|e| format!("Failed to unregister shortcut '{}': {}", shortcut_key, e))?;

    info!("Unregistered global shortcut: {}", shortcut_key);
    Ok(())
}
