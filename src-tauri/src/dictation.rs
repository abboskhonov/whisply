use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

pub struct DictationState {
    generation: AtomicU64,
}

impl DictationState {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
        }
    }

    fn begin_session(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct DictationResult {
    pub text: String,
    pub audio_duration_ms: u64,
    pub transcription_duration_ms: u64,
    pub insertion_method: String,
}

#[derive(Clone, Debug, Serialize)]
struct DictationError {
    message: String,
}

pub fn start(app: &AppHandle, shortcut_key: &str) -> Result<(), String> {
    // Fail before opening the microphone if onboarding has not installed a model.
    app.state::<crate::models::ModelManager>()
        .selected_model_dir(app)?;
    app.state::<DictationState>().begin_session();
    crate::overlay::show(app, "recording", "", shortcut_key);
    crate::audio::start_audio_capture(app.clone(), None).map(|_| ())
}

pub fn finish(app: &AppHandle) -> Result<(), String> {
    finish_with_insertion(app, true)
}

pub fn finish_for_playground(app: &AppHandle) -> Result<(), String> {
    finish_with_insertion(app, false)
}

fn finish_with_insertion(app: &AppHandle, should_insert: bool) -> Result<(), String> {
    let (stopped, audio) = crate::audio::stop_and_take_audio(app)?;
    if stopped.reason == "not_running" {
        // A release can arrive after a dev restart or cancellation without a
        // matching press. It is harmless and must not leave an error overlay.
        crate::overlay::hide(app);
        return Ok(());
    }
    if audio.samples.is_empty() {
        crate::overlay::hide(app);
        return Err("No microphone audio was captured".to_string());
    }

    let generation = app.state::<DictationState>().generation.load(Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        let audio_duration_ms =
            audio.samples.len() as u64 * 1000 / audio.sample_rate.max(1) as u64;
        let started = Instant::now();
        let transcription = app.state::<crate::transcription::TranscriptionState>();
        let result = transcription.transcribe(&app, &audio.samples, audio.sample_rate);
        transcription.unload();

        let result = result.and_then(|text| {
                if text.trim().is_empty() {
                    return Err("No speech was detected".to_string());
                }
                if !app.state::<DictationState>().is_current(generation) {
                    return Err("Dictation was cancelled".to_string());
                }
                let text = match app
                    .state::<crate::snippets::SnippetStore>()
                    .resolve_spoken_command(&text)
                {
                    Some(snippet) => {
                        if let Err(error) = app
                            .state::<crate::snippets::SnippetStore>()
                            .mark_used(snippet.id)
                        {
                            log::error!("could not update snippet usage: {error}");
                        }
                        log::info!("expanded spoken snippet command: {}", snippet.name);
                        snippet.body
                    }
                    None => text,
                };
                // Remove the overlay before inserting text. The Playground
                // follows the same capture/transcription flow but keeps its
                // result in-app so testing never types into another application.
                crate::overlay::hide(&app);
                let insertion_method = if should_insert {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    crate::input::insert_text_locally(&app, &text)?.method.to_string()
                } else {
                    "playground".to_string()
                };
                Ok(DictationResult {
                    text,
                    audio_duration_ms,
                    transcription_duration_ms: started.elapsed().as_millis() as u64,
                    insertion_method,
                })
            });

        match result {
            Ok(result) => {
                log::info!(
                    "dictation complete: audio={}ms transcription={}ms method={}",
                    result.audio_duration_ms,
                    result.transcription_duration_ms,
                    result.insertion_method
                );
                if let Err(error) = app
                    .state::<crate::history::HistoryStore>()
                    .record_dictation(&result)
                {
                    // Saving history must not make a successfully inserted
                    // dictation appear to have failed.
                    log::error!("could not save dictation history: {error}");
                }
                let _ = app.emit("whisply://dictation-result", &result);
                std::thread::sleep(std::time::Duration::from_millis(250));
                if app.state::<DictationState>().is_current(generation) {
                    crate::overlay::hide(&app);
                }
            }
            Err(error) if error == "Dictation was cancelled" => {
                log::info!("discarded cancelled dictation result");
            }
            Err(error) => {
                log::error!("dictation failed: {error}");
                let _ = app.emit(
                    "whisply://dictation-error",
                    DictationError {
                        message: error.clone(),
                    },
                );
                crate::overlay::emit_error(&app, &error);
                std::thread::sleep(std::time::Duration::from_secs(3));
                if app.state::<DictationState>().is_current(generation) {
                    crate::overlay::hide(&app);
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn start_playground_dictation(app: AppHandle) -> Result<(), String> {
    start(&app, "Playground")
}

#[tauri::command]
pub fn stop_playground_dictation(app: AppHandle) -> Result<(), String> {
    finish_for_playground(&app)
}
