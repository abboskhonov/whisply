use bzip2::read::BzDecoder;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tar::Archive;
use tauri::{AppHandle, Emitter, Manager};

const MODEL_STATE_FILE: &str = "model-state.json";
const PROGRESS_EVENT: &str = "whisply://model-download-progress";

#[derive(Clone, Copy)]
pub struct ModelSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub languages: &'static str,
    pub archive_name: &'static str,
    pub directory_name: &'static str,
    pub download_url: &'static str,
    pub download_size_bytes: u64,
}

const MODELS: [ModelSpec; 2] = [
    ModelSpec {
        id: "parakeet-tdt-0.6b-v3-int8",
        name: "Parakeet 0.6B Multilingual",
        description: "Best default · punctuation, capitalization, and 25 European languages",
        languages: "25 languages",
        archive_name: "parakeet-tdt-0.6b-v3-int8.tar.bz2",
        directory_name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
        download_url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
        download_size_bytes: 487_170_055,
    },
    ModelSpec {
        id: "parakeet-tdt-0.6b-v2-int8",
        name: "Parakeet 0.6B English",
        description: "English-only · slightly faster and more accurate for English dictation",
        languages: "English",
        archive_name: "parakeet-tdt-0.6b-v2-int8.tar.bz2",
        directory_name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
        download_url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2",
        download_size_bytes: 482_468_385,
    },
];

#[derive(Clone, Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub languages: String,
    pub download_size_bytes: u64,
    pub installed: bool,
    pub selected: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ModelDownloadProgress {
    pub model_id: String,
    pub stage: &'static str,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub percent: f64,
    pub message: String,
}

#[derive(Default, Deserialize, Serialize)]
struct PersistedModelState {
    selected_model_id: Option<String>,
}

#[derive(Clone)]
pub struct ModelManager {
    selected: Arc<Mutex<Option<String>>>,
    downloading: Arc<AtomicBool>,
    cancel_download: Arc<AtomicBool>,
}

impl ModelManager {
    pub fn new() -> Self {
        Self {
            selected: Arc::new(Mutex::new(None)),
            downloading: Arc::new(AtomicBool::new(false)),
            cancel_download: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn init(&self, app: &AppHandle) {
        let Ok(path) = state_path(app) else {
            return;
        };
        let Ok(json) = fs::read_to_string(&path) else {
            return;
        };
        match serde_json::from_str::<PersistedModelState>(&json) {
            Ok(saved) => {
                *self.selected.lock().unwrap() = saved.selected_model_id;
                log::info!("model state loaded from {}", path.display());
            }
            Err(error) => log::warn!("invalid model state at {}: {error}", path.display()),
        }
    }

    pub fn selected_model_dir(&self, app: &AppHandle) -> Result<PathBuf, String> {
        let selected = self
            .selected
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| "No speech model selected. Finish model setup in onboarding.".to_string())?;
        let spec = model_spec(&selected)?;
        let path = models_dir(app)?.join(spec.directory_name);
        validate_model_dir(&path)?;
        Ok(path)
    }

    fn select(&self, app: &AppHandle, model_id: &str) -> Result<(), String> {
        let spec = model_spec(model_id)?;
        validate_model_dir(&models_dir(app)?.join(spec.directory_name))?;
        *self.selected.lock().map_err(|error| error.to_string())? =
            Some(model_id.to_string());
        persist_selection(app, Some(model_id))
    }
}

fn model_spec(model_id: &str) -> Result<ModelSpec, String> {
    MODELS
        .iter()
        .copied()
        .find(|model| model.id == model_id)
        .ok_or_else(|| format!("Unknown speech model '{model_id}'"))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("models"))
        .map_err(|error| format!("Could not resolve model directory: {error}"))
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(MODEL_STATE_FILE))
        .map_err(|error| format!("Could not resolve model state path: {error}"))
}

fn persist_selection(app: &AppHandle, selected_model_id: Option<&str>) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(&PersistedModelState {
        selected_model_id: selected_model_id.map(str::to_string),
    })
    .map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, json).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

fn validate_model_dir(path: &Path) -> Result<(), String> {
    const REQUIRED_FILES: [(&str, u64); 4] = [
        ("encoder.int8.onnx", 100_000_000),
        ("decoder.int8.onnx", 1_000),
        ("joiner.int8.onnx", 1_000),
        ("tokens.txt", 100),
    ];

    for (file, minimum_size) in REQUIRED_FILES {
        let candidate = path.join(file);
        let metadata = fs::metadata(&candidate)
            .map_err(|_| format!("Speech model is incomplete: {} is missing", candidate.display()))?;
        if !metadata.is_file() || metadata.len() < minimum_size {
            return Err(format!("Speech model file is invalid: {}", candidate.display()));
        }
    }
    Ok(())
}

fn emit_progress(
    app: &AppHandle,
    spec: ModelSpec,
    stage: &'static str,
    downloaded: u64,
    total: u64,
    message: impl Into<String>,
) {
    let percent = if total == 0 {
        0.0
    } else {
        (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    };
    let _ = app.emit(
        PROGRESS_EVENT,
        ModelDownloadProgress {
            model_id: spec.id.to_string(),
            stage,
            bytes_downloaded: downloaded,
            total_bytes: total,
            percent,
            message: message.into(),
        },
    );
}

fn download_and_extract(
    app: &AppHandle,
    manager: &ModelManager,
    spec: ModelSpec,
) -> Result<(), String> {
    let base = models_dir(app)?;
    fs::create_dir_all(&base).map_err(|error| error.to_string())?;
    let archive_path = base.join(format!("{}.part", spec.archive_name));
    let model_path = base.join(spec.directory_name);
    let _ = fs::remove_file(&archive_path);

    emit_progress(
        app,
        spec,
        "downloading",
        0,
        spec.download_size_bytes,
        "Connecting…",
    );

    let client = reqwest::blocking::Client::builder()
        .user_agent("Whisply/0.1")
        .build()
        .map_err(|error| format!("Could not create downloader: {error}"))?;
    let mut response = client
        .get(spec.download_url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| format!("Model download failed: {error}"))?;
    let total = response.content_length().unwrap_or(spec.download_size_bytes);
    let mut output = File::create(&archive_path).map_err(|error| error.to_string())?;
    let mut buffer = vec![0_u8; 256 * 1024];
    let mut downloaded = 0_u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    loop {
        if manager.cancel_download.load(Ordering::SeqCst) {
            drop(output);
            let _ = fs::remove_file(&archive_path);
            emit_progress(app, spec, "cancelled", downloaded, total, "Download cancelled");
            return Ok(());
        }

        let count = response
            .read(&mut buffer)
            .map_err(|error| format!("Model download interrupted: {error}"))?;
        if count == 0 {
            break;
        }
        output
            .write_all(&buffer[..count])
            .map_err(|error| format!("Could not save model: {error}"))?;
        downloaded += count as u64;
        if last_emit.elapsed() >= Duration::from_millis(120) {
            emit_progress(app, spec, "downloading", downloaded, total, "Downloading model…");
            last_emit = Instant::now();
        }
    }
    output.sync_all().map_err(|error| error.to_string())?;

    emit_progress(app, spec, "extracting", downloaded, total, "Installing model…");
    let _ = fs::remove_dir_all(&model_path);
    let archive = File::open(&archive_path).map_err(|error| error.to_string())?;
    Archive::new(BzDecoder::new(archive))
        .unpack(&base)
        .map_err(|error| format!("Could not extract model: {error}"))?;

    emit_progress(app, spec, "verifying", downloaded, total, "Verifying model files…");
    validate_model_dir(&model_path)?;
    manager.select(app, spec.id)?;
    let _ = fs::remove_file(&archive_path);
    emit_progress(app, spec, "ready", total, total, "Model ready");
    log::info!("speech model installed and selected: {}", spec.id);
    Ok(())
}

#[tauri::command]
pub fn list_models(app: AppHandle, manager: tauri::State<'_, ModelManager>) -> Result<Vec<ModelInfo>, String> {
    let selected = manager
        .selected
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let base = models_dir(&app)?;
    Ok(MODELS
        .iter()
        .map(|spec| ModelInfo {
            id: spec.id.to_string(),
            name: spec.name.to_string(),
            description: spec.description.to_string(),
            languages: spec.languages.to_string(),
            download_size_bytes: spec.download_size_bytes,
            installed: validate_model_dir(&base.join(spec.directory_name)).is_ok(),
            selected: selected.as_deref() == Some(spec.id),
        })
        .collect())
}

#[tauri::command]
pub fn select_model(
    app: AppHandle,
    model_id: String,
    manager: tauri::State<'_, ModelManager>,
) -> Result<(), String> {
    manager.select(&app, &model_id)
}

#[tauri::command]
pub fn download_model(
    app: AppHandle,
    model_id: String,
    manager: tauri::State<'_, ModelManager>,
) -> Result<(), String> {
    let spec = model_spec(&model_id)?;
    if manager
        .downloading
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Another model download is already running".to_string());
    }

    manager.cancel_download.store(false, Ordering::SeqCst);
    let manager = manager.inner().clone();
    std::thread::spawn(move || {
        if let Err(error) = download_and_extract(&app, &manager, spec) {
            log::error!("model setup failed: {error}");
            emit_progress(&app, spec, "error", 0, spec.download_size_bytes, error);
        }
        manager.downloading.store(false, Ordering::SeqCst);
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_model_download(manager: tauri::State<'_, ModelManager>) {
    manager.cancel_download.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_and_directories_are_unique() {
        assert_ne!(MODELS[0].id, MODELS[1].id);
        assert_ne!(MODELS[0].directory_name, MODELS[1].directory_name);
    }

    #[test]
    fn unknown_model_is_rejected() {
        assert!(model_spec("not-a-model").is_err());
    }
}
