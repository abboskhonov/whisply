mod audio;
mod input;
mod onboarding;
mod overlay;
mod shortcut;
mod system;

use std::sync::Arc;



use tauri::webview::PageLoadEvent;
use tauri::Listener;
use tauri::Manager;
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_log::{Target, TargetKind};

fn external_navigation_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("external-navigation")
        .on_navigation(|webview, url| {
            let is_internal_host = matches!(
                url.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost") | Some("::1")
            );

            let is_internal = url.scheme() == "tauri" || is_internal_host;

            if is_internal {
                return true;
            }

            let is_external_link = matches!(url.scheme(), "http" | "https" | "mailto" | "tel");

            if is_external_link {
                log::info!("opening external link in system browser: {}", url);
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }

            true
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(GlobalShortcutBuilder::new().build())
        .plugin(external_navigation_plugin())
        .manage(shortcut::ShortcutRegistry::new())
        .manage(shortcut::ListenerRunning::new())
        .manage(onboarding::OnboardingState::new())
        .manage(Arc::new(audio::AudioState::new()))
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("main webview finished loading");
                let _ = webview.window().show();
            }
            if webview.label() == "recording_overlay"
                && matches!(payload.event(), PageLoadEvent::Finished)
            {
                log::info!("recording_overlay webview finished loading");
                overlay::mark_ready(&webview.app_handle());
            }
        })
        .setup(|app| {
            // Safety net: if the recording_overlay webview wasn't created
            // from the static config (e.g. dev process started before the
            // config was updated), create it now so push-to-talk still
            // works after a hot reload.
            let handle = app.handle().clone();
            overlay::ensure_window(&handle);

            // Load the persisted "onboarding complete?" flag and, if the
            // user hasn't finished the wizard yet, pop the small window
            // open. The main window also comes up underneath.
            let onboarding_state = app.state::<onboarding::OnboardingState>();
            onboarding_state.init(&handle);
            onboarding::open_if_incomplete(&handle);

            // The global-shortcut plugin doesn't need a manual "start" —
            // it installs its handler at builder time and starts watching
            // as soon as a shortcut is registered. We just log the boot
            // so it's obvious in `tauri dev` output that the pipeline
            // came up cleanly.
            log::info!("global-shortcut plugin ready (registration is per-shortcut)");

            // Listen for the overlay's cancel button and stop capture + hide.
            // The cancel event is emitted from the overlay window with no
            // payload — the user just wants out.
            let h2 = handle.clone();
            app.listen("whisply://overlay-cancel", move |_event| {
                log::info!("overlay cancel received");
                let _ = audio::stop_audio_capture(h2.clone());
                overlay::hide(&h2);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system::get_system_info,
            system::get_microphone_status,
            system::get_input_status,
            system::get_evdev_access_status,
            system::fix_evdev_permissions,
            input::initialize_input,
            input::test_input_connection,
            shortcut::start_shortcut_listener,
            shortcut::register_shortcut_evdev,
            shortcut::unregister_shortcut_evdev,
            shortcut::unregister_all_shortcuts_evdev,
            audio::list_microphones,
            audio::start_audio_capture,
            audio::stop_audio_capture,
            audio::is_capturing,
            onboarding::is_onboarding_complete,
            onboarding::mark_onboarding_complete,
            onboarding::reset_onboarding,
            onboarding::open_onboarding_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
