mod audio;
mod dictation;
mod dictionary;
mod input;
mod history;
mod models;
mod onboarding;
mod overlay;
mod shortcut;
mod snippets;
mod system;
mod transcription;

use std::sync::Arc;



use tauri::webview::PageLoadEvent;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
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
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(GlobalShortcutBuilder::new().build())
        .plugin(external_navigation_plugin());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        },
    ));

    builder
        .manage(shortcut::ShortcutRegistry::new())
        .manage(onboarding::OnboardingState::new())
        .manage(dictation::DictationState::new())
        .manage(models::ModelManager::new())
        .manage(input::InputState::new())
        .manage(transcription::TranscriptionState::new())
        .manage(Arc::new(audio::AudioState::new()))
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("main webview finished loading");
                let _ = webview.window().show();
            }
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "Show Whisply").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Whisply").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
            let icon = app
                .default_window_icon()
                .expect("application icon must be configured")
                .clone();

            TrayIconBuilder::with_id("whisply")
                .icon(icon)
                .tooltip("Whisply")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            #[cfg(desktop)]
            {
                let _ = app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None,
                ));
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            // The overlay is created dynamically so there is exactly one
            // window owned by this process, including after a hot reload.
            let handle = app.handle().clone();
            overlay::ensure_window(&handle);

            // Load the persisted "onboarding complete?" flag and, if the
            // user hasn't finished the wizard yet, pop the small window
            // open. The main window also comes up underneath.
            let onboarding_state = app.state::<onboarding::OnboardingState>();
            onboarding_state.init(&handle);
            app.state::<models::ModelManager>().init(&handle);
            app.state::<Arc<audio::AudioState>>().init(&handle);
            app.state::<transcription::TranscriptionState>().init(&handle);
            app.manage(history::HistoryStore::open(&handle)?);
            app.manage(snippets::SnippetStore::open(&handle)?);
            app.manage(dictionary::DictionaryStore::open(&handle)?);
            onboarding::open_if_incomplete(&handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system::get_system_info,
            system::get_microphone_status,
            system::get_input_status,
            system::get_update_channel,
            system::get_evdev_access_status,
            system::fix_evdev_permissions,
            models::list_models,
            models::select_model,
            models::download_model,
            models::cancel_model_download,
            input::initialize_input,
            input::test_input_connection,
            input::insert_text,
            shortcut::start_shortcut_listener,
            shortcut::register_shortcut_evdev,
            shortcut::unregister_shortcut_evdev,
            shortcut::unregister_all_shortcuts_evdev,
            overlay::overlay_ready,
            overlay::set_overlay_position,
            audio::list_microphones,
            audio::get_selected_microphone,
            audio::set_selected_microphone,
            audio::start_audio_capture,
            audio::stop_audio_capture,
            audio::is_capturing,
            onboarding::is_onboarding_complete,
            onboarding::mark_onboarding_complete,
            onboarding::reset_onboarding,
            onboarding::open_onboarding_window,
            history::get_home_dashboard,
            history::get_insights_dashboard,
            history::get_dictation_archive,
            history::delete_dictation,
            snippets::list_snippets,
            snippets::add_snippet,
            snippets::delete_snippet,
            dictionary::list_dictionary_entries,
            dictionary::add_dictionary_entry,
            dictionary::delete_dictionary_entry,
            dictation::start_playground_dictation,
            dictation::stop_playground_dictation,
            transcription::get_model_memory_settings,
            transcription::set_model_memory_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
