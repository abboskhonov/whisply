use bzip2::read::BzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
    pub parameters: &'static str,
    pub architecture: &'static str,
    pub owner: &'static str,
    pub license: &'static str,
    pub source_url: &'static str,
    pub directory_name: &'static str,
    pub source: ModelSource,
    pub format: ModelFormat,
    pub download_size_bytes: u64,
}

#[derive(Clone, Copy)]
pub enum ModelSource {
    Archive {
        archive_name: &'static str,
        download_url: &'static str,
        sha256: &'static str,
    },
    Files(&'static [ModelFile]),
}

#[derive(Clone, Copy)]
pub struct ModelFile {
    pub destination: &'static str,
    pub download_url: &'static str,
    pub sha256: &'static str,
    pub installed_sha256: &'static str,
}

#[derive(Clone, Copy)]
pub enum ModelFormat {
    NemoTransducer,
    GigaAmCtc,
    Qwen3Asr,
}

const GIGA_AM_MULTILINGUAL_FILES: [ModelFile; 2] = [
    ModelFile {
        destination: "model.int8.onnx",
        download_url: "https://huggingface.co/istupakov/gigaam-multilingual-ctc-onnx/resolve/458860e1983aef670dd9795fb6af603c82767d5d/multilingual_ctc.int8.onnx?download=true",
        sha256: "e08e27ae5669b39f0c378fae101bbbb9a80505f74f9b66719c309bf5b894a480",
        installed_sha256: "cf47ca34a01262dd753394163cdaaf1a354f0c978ab5c9c19829ca46cba5f354",
    },
    ModelFile {
        destination: "tokens.txt",
        download_url: "https://huggingface.co/istupakov/gigaam-multilingual-ctc-onnx/resolve/458860e1983aef670dd9795fb6af603c82767d5d/multilingual_vocab.txt?download=true",
        sha256: "4d130287892e1099fedfb3f93c4b4cf8a263151158801680b28977d1be4133f4",
        installed_sha256: "4d130287892e1099fedfb3f93c4b4cf8a263151158801680b28977d1be4133f4",
    },
];

const MODELS: [ModelSpec; 4] = [
    ModelSpec {
        id: "parakeet-tdt-0.6b-v3-int8",
        name: "Parakeet 0.6B Multilingual",
        description: "Best default · punctuation, capitalization, and 25 European languages",
        languages: "25 languages",
        parameters: "600M",
        architecture: "FastConformer-TDT",
        owner: "NVIDIA",
        license: "CC BY 4.0",
        source_url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3",
        directory_name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
        source: ModelSource::Archive {
            archive_name: "parakeet-tdt-0.6b-v3-int8.tar.bz2",
            download_url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
            sha256: "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
        },
        format: ModelFormat::NemoTransducer,
        download_size_bytes: 487_170_055,
    },
    ModelSpec {
        id: "parakeet-tdt-0.6b-v2-int8",
        name: "Parakeet 0.6B English",
        description: "English-only · slightly faster and more accurate for English dictation",
        languages: "English",
        parameters: "600M",
        architecture: "FastConformer-TDT",
        owner: "NVIDIA",
        license: "CC BY 4.0",
        source_url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2",
        directory_name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
        source: ModelSource::Archive {
            archive_name: "parakeet-tdt-0.6b-v2-int8.tar.bz2",
            download_url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2",
            sha256: "157c157bc51155e03e37d2466522a3a737dd9c72bb25f36eb18912964161e1ad",
        },
        format: ModelFormat::NemoTransducer,
        download_size_bytes: 482_468_385,
    },
    ModelSpec {
        id: "gigaam-multilingual-ctc-int8",
        name: "GigaAM Multilingual",
        description: "Best for Uzbek, Kazakh, and Kyrgyz dictation",
        languages: "Uzbek, Kazakh, Kyrgyz, Russian, English",
        parameters: "220M",
        architecture: "Conformer CTC",
        owner: "AI SAGE / Salute Developers",
        license: "MIT",
        source_url: "https://huggingface.co/istupakov/gigaam-multilingual-ctc-onnx",
        directory_name: "gigaam-multilingual-ctc-int8",
        source: ModelSource::Files(&GIGA_AM_MULTILINGUAL_FILES),
        format: ModelFormat::GigaAmCtc,
        download_size_bytes: 224_762_597,
    },
    ModelSpec {
        id: "qwen3-asr-0.6b-int8",
        name: "Qwen3 ASR 0.6B",
        description: "High-accuracy multilingual dictation with native hotword support",
        languages: "52 languages and dialects",
        parameters: "600M",
        architecture: "Qwen3-ASR",
        owner: "Qwen",
        license: "Apache 2.0",
        source_url: "https://huggingface.co/Qwen/Qwen3-ASR-0.6B",
        directory_name: "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25",
        source: ModelSource::Archive {
            archive_name: "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2",
            download_url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2",
            sha256: "393f8a14e2f5fb96746aaab342997a40641001fbd5bf9592a080a8329178ee96",
        },
        format: ModelFormat::Qwen3Asr,
        download_size_bytes: 878_702_423,
    },
];

#[derive(Clone, Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub languages: String,
    pub parameters: String,
    pub architecture: String,
    pub owner: String,
    pub license: String,
    pub source_url: String,
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
        self.selected_model(app).map(|(path, _)| path)
    }

    pub fn selected_model(&self, app: &AppHandle) -> Result<(PathBuf, ModelFormat), String> {
        let selected = self
            .selected
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| {
                "No speech model selected. Finish model setup in onboarding.".to_string()
            })?;
        let spec = model_spec(&selected)?;
        let path = models_dir(app)?.join(spec.directory_name);
        validate_model_dir(&path, spec)?;
        Ok((path, spec.format))
    }

    fn select(&self, app: &AppHandle, model_id: &str) -> Result<(), String> {
        let spec = model_spec(model_id)?;
        validate_model_dir(&models_dir(app)?.join(spec.directory_name), spec)?;
        *self.selected.lock().map_err(|error| error.to_string())? = Some(model_id.to_string());
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

fn validate_model_dir(path: &Path, spec: ModelSpec) -> Result<(), String> {
    let required_files: &[(&str, u64)] = match spec.format {
        ModelFormat::NemoTransducer => &[
            ("encoder.int8.onnx", 100_000_000),
            ("decoder.int8.onnx", 1_000),
            ("joiner.int8.onnx", 1_000),
            ("tokens.txt", 100),
        ],
        ModelFormat::GigaAmCtc => &[("model.int8.onnx", 100_000_000), ("tokens.txt", 100)],
        ModelFormat::Qwen3Asr => &[
            ("conv_frontend.onnx", 40_000_000),
            ("encoder.int8.onnx", 100_000_000),
            ("decoder.int8.onnx", 700_000_000),
            ("tokenizer/vocab.json", 2_000_000),
            ("tokenizer/merges.txt", 1_000_000),
            ("tokenizer/tokenizer_config.json", 1_000),
        ],
    };

    for (file, minimum_size) in required_files {
        let candidate = path.join(file);
        let metadata = fs::metadata(&candidate).map_err(|_| {
            format!(
                "Speech model is incomplete: {} is missing",
                candidate.display()
            )
        })?;
        if !metadata.is_file() || metadata.len() < *minimum_size {
            return Err(format!(
                "Speech model file is invalid: {}",
                candidate.display()
            ));
        }
    }
    if let ModelSource::Files(files) = spec.source {
        for file in files {
            verify_file_digest(&path.join(file.destination), file.installed_sha256)
                .map_err(|error| format!("model validation: {error}"))?;
        }
    }
    Ok(())
}

fn verify_file_digest(path: &Path, expected: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|_| format!("{} is missing", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 256 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    let actual = format!("{:x}", digest.finalize());
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "{} has an unexpected SHA-256 digest",
            path.display()
        ))
    }
}

fn validate_staged_model(path: &Path, spec: ModelSpec) -> Result<(), String> {
    validate_model_dir(path, spec).map_err(|error| format!("model validation: {error}"))?;
    crate::transcription::create_recognizer(path, spec.format)
        .map(|_| ())
        .map_err(|_| {
            "recognizer initialization: could not initialize the staged speech model".to_string()
        })
}

fn unique_path(base: &Path, name: &str) -> PathBuf {
    base.join(format!(
        ".{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}

fn replace_model_dir<F>(staged: &Path, live: &Path, select: F) -> Result<(), String>
where
    F: FnOnce() -> Result<(), String>,
{
    let backup = unique_path(
        live.parent()
            .ok_or_else(|| "model validation: invalid model path".to_string())?,
        "model-backup",
    );
    let had_live_model = live.exists();
    if had_live_model {
        fs::rename(live, &backup)
            .map_err(|_| "model validation: could not preserve the existing model".to_string())?;
    }

    if let Err(error) = fs::rename(staged, live) {
        if had_live_model {
            let _ = fs::rename(&backup, live);
        }
        return Err(format!(
            "model validation: could not activate the verified model: {error}"
        ));
    }

    if let Err(error) = select() {
        let _ = fs::remove_dir_all(live);
        if had_live_model {
            let _ = fs::rename(&backup, live);
        }
        return Err(error);
    }

    if had_live_model {
        fs::remove_dir_all(&backup).map_err(|error| {
            format!("model validation: could not remove the replaced model: {error}")
        })?;
    }
    Ok(())
}

fn add_gigaam_metadata(model_path: &Path) -> Result<(), String> {
    // sherpa-onnx relies on these standard ONNX metadata entries to configure
    // GigaAM's CTC decoder. The compact model conversion omits them.
    let mut model = fs::OpenOptions::new()
        .append(true)
        .open(model_path)
        .map_err(|error| error.to_string())?;
    for (key, value) in [
        ("vocab_size", "71"),
        ("subsampling_factor", "4"),
        ("normalize_type", ""),
        ("is_giga_am", "1"),
    ] {
        let mut entry = Vec::with_capacity(key.len() + value.len() + 4);
        entry.extend([0x0a, key.len() as u8]);
        entry.extend(key.as_bytes());
        entry.extend([0x12, value.len() as u8]);
        entry.extend(value.as_bytes());
        model
            .write_all(&[0x72, entry.len() as u8])
            .and_then(|_| model.write_all(&entry))
            .map_err(|error| error.to_string())?;
    }
    model.sync_all().map_err(|error| error.to_string())
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
    match spec.source {
        ModelSource::Archive {
            archive_name,
            download_url,
            sha256,
        } => download_archive(app, manager, spec, archive_name, download_url, sha256),
        ModelSource::Files(files) => download_files(app, manager, spec, files),
    }
}

fn download_archive(
    app: &AppHandle,
    manager: &ModelManager,
    spec: ModelSpec,
    archive_name: &str,
    download_url: &str,
    sha256: &str,
) -> Result<(), String> {
    let base = models_dir(app)?;
    fs::create_dir_all(&base).map_err(|error| error.to_string())?;
    let archive_path = base.join(format!("{archive_name}.part"));
    let model_path = base.join(spec.directory_name);
    let staging_root = unique_path(&base, "model-staging");
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
        .get(download_url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| format!("Model download failed: {error}"))?;
    let total = response
        .content_length()
        .unwrap_or(spec.download_size_bytes);
    let mut output = File::create(&archive_path).map_err(|error| error.to_string())?;
    let mut buffer = vec![0_u8; 256 * 1024];
    let mut downloaded = 0_u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    loop {
        if manager.cancel_download.load(Ordering::SeqCst) {
            drop(output);
            let _ = fs::remove_file(&archive_path);
            emit_progress(
                app,
                spec,
                "cancelled",
                downloaded,
                total,
                "Download cancelled",
            );
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
            emit_progress(
                app,
                spec,
                "downloading",
                downloaded,
                total,
                "Downloading model…",
            );
            last_emit = Instant::now();
        }
    }
    output.sync_all().map_err(|error| error.to_string())?;
    verify_file_digest(&archive_path, sha256)
        .map_err(|error| format!("download verification: {error}"))?;

    emit_progress(
        app,
        spec,
        "extracting",
        downloaded,
        total,
        "Installing model…",
    );
    fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;
    let archive = File::open(&archive_path).map_err(|error| error.to_string())?;
    if let Err(error) = Archive::new(BzDecoder::new(archive)).unpack(&staging_root) {
        let _ = fs::remove_dir_all(&staging_root);
        return Err(format!(
            "model validation: could not extract model: {error}"
        ));
    }
    let staged_model = staging_root.join(spec.directory_name);

    emit_progress(
        app,
        spec,
        "verifying",
        downloaded,
        total,
        "Verifying model files…",
    );
    if let Err(error) = validate_staged_model(&staged_model, spec) {
        let _ = fs::remove_dir_all(&staging_root);
        return Err(error);
    }
    let result = replace_model_dir(&staged_model, &model_path, || manager.select(app, spec.id));
    let _ = fs::remove_dir_all(&staging_root);
    result?;
    let _ = fs::remove_file(&archive_path);
    emit_progress(app, spec, "ready", total, total, "Model ready");
    log::info!("speech model installed and selected: {}", spec.id);
    Ok(())
}

fn download_files(
    app: &AppHandle,
    manager: &ModelManager,
    spec: ModelSpec,
    files: &[ModelFile],
) -> Result<(), String> {
    let base = models_dir(app)?;
    fs::create_dir_all(&base).map_err(|error| error.to_string())?;
    let model_path = base.join(spec.directory_name);
    let temporary_path = unique_path(&base, "model-staging");
    let _ = fs::remove_dir_all(&temporary_path);
    fs::create_dir_all(&temporary_path).map_err(|error| error.to_string())?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("Whisply/0.1")
        .build()
        .map_err(|error| format!("Could not create downloader: {error}"))?;
    let mut downloaded = 0_u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    emit_progress(
        app,
        spec,
        "downloading",
        downloaded,
        spec.download_size_bytes,
        "Connecting…",
    );

    for file in files {
        let mut response = client
            .get(file.download_url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| format!("Model download failed: {error}"))?;
        let mut output = File::create(temporary_path.join(file.destination))
            .map_err(|error| error.to_string())?;
        let mut buffer = vec![0_u8; 256 * 1024];

        loop {
            if manager.cancel_download.load(Ordering::SeqCst) {
                drop(output);
                let _ = fs::remove_dir_all(&temporary_path);
                emit_progress(
                    app,
                    spec,
                    "cancelled",
                    downloaded,
                    spec.download_size_bytes,
                    "Download cancelled",
                );
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
                emit_progress(
                    app,
                    spec,
                    "downloading",
                    downloaded,
                    spec.download_size_bytes,
                    "Downloading model…",
                );
                last_emit = Instant::now();
            }
        }
        output.sync_all().map_err(|error| error.to_string())?;
        verify_file_digest(&temporary_path.join(file.destination), file.sha256)
            .map_err(|error| format!("download verification: {error}"))?;
    }

    if matches!(spec.format, ModelFormat::GigaAmCtc) {
        add_gigaam_metadata(&temporary_path.join("model.int8.onnx"))?;
    }
    emit_progress(
        app,
        spec,
        "verifying",
        downloaded,
        spec.download_size_bytes,
        "Verifying model files…",
    );
    if let Err(error) = validate_staged_model(&temporary_path, spec) {
        let _ = fs::remove_dir_all(&temporary_path);
        return Err(error);
    }
    replace_model_dir(&temporary_path, &model_path, || {
        manager.select(app, spec.id)
    })?;
    emit_progress(
        app,
        spec,
        "ready",
        downloaded,
        spec.download_size_bytes,
        "Model ready",
    );
    log::info!("speech model installed and selected: {}", spec.id);
    Ok(())
}

#[tauri::command]
pub fn list_models(
    app: AppHandle,
    manager: tauri::State<'_, ModelManager>,
) -> Result<Vec<ModelInfo>, String> {
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
            parameters: spec.parameters.to_string(),
            architecture: spec.architecture.to_string(),
            owner: spec.owner.to_string(),
            license: spec.license.to_string(),
            source_url: spec.source_url.to_string(),
            download_size_bytes: spec.download_size_bytes,
            installed: validate_model_dir(&base.join(spec.directory_name), *spec).is_ok(),
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
        for (index, model) in MODELS.iter().enumerate() {
            for other in &MODELS[index + 1..] {
                assert_ne!(model.id, other.id);
                assert_ne!(model.directory_name, other.directory_name);
            }
        }
    }

    #[test]
    fn unknown_model_is_rejected() {
        assert!(model_spec("not-a-model").is_err());
    }

    #[test]
    fn gigaam_metadata_is_appended_as_onnx_properties() {
        let model_path =
            std::env::temp_dir().join(format!("whisply-gigaam-metadata-{}", std::process::id()));
        fs::write(&model_path, []).expect("create test model");
        add_gigaam_metadata(&model_path).expect("append metadata");
        assert_eq!(
            fs::read(&model_path).expect("read test model"),
            b"\x72\x10\x0a\x0a vocab_size\x12\x02 71\x72\x17\x0a\x12 subsampling_factor\x12\x01 4\x72\x12\x0a\x0e normalize_type\x12\x00\x72\x0f\x0a\x0a is_giga_am\x12\x01 1"
                .iter()
                .filter(|byte| **byte != b' ')
                .copied()
                .collect::<Vec<_>>()
        );
        let _ = fs::remove_file(model_path);
    }

    fn test_dir(name: &str) -> PathBuf {
        let path = unique_path(&std::env::temp_dir(), name);
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    #[test]
    fn missing_and_undersized_model_files_are_rejected() {
        let path = test_dir("whisply-model-validation");
        assert!(validate_model_dir(&path, MODELS[2]).is_err());

        fs::write(path.join("model.int8.onnx"), [0_u8; 32]).expect("write small model");
        fs::write(path.join("tokens.txt"), "tokens").expect("write tokens");
        assert!(validate_model_dir(&path, MODELS[2]).is_err());
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn digest_mismatches_are_rejected() {
        let root = test_dir("whisply-digest-validation");
        let path = root.join("file");
        fs::write(&path, "not the expected file").expect("write file");
        assert!(verify_file_digest(&path, "00").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_replacement_restores_the_live_model() {
        let root = test_dir("whisply-model-rollback");
        let live = root.join("live");
        let staged = root.join("staged");
        fs::create_dir_all(&live).expect("create live model");
        fs::create_dir_all(&staged).expect("create staged model");
        fs::write(live.join("marker"), "old").expect("write live marker");
        fs::write(staged.join("marker"), "new").expect("write staged marker");

        assert!(replace_model_dir(&staged, &live, || Err("selection failed".to_string())).is_err());
        assert_eq!(
            fs::read_to_string(live.join("marker")).expect("read restored model"),
            "old"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn successful_replacement_activates_the_staged_model() {
        let root = test_dir("whisply-model-replacement");
        let live = root.join("live");
        let staged = root.join("staged");
        fs::create_dir_all(&live).expect("create live model");
        fs::create_dir_all(&staged).expect("create staged model");
        fs::write(live.join("marker"), "old").expect("write live marker");
        fs::write(staged.join("marker"), "new").expect("write staged marker");

        replace_model_dir(&staged, &live, || Ok(())).expect("replace model");
        assert_eq!(
            fs::read_to_string(live.join("marker")).expect("read replacement"),
            "new"
        );
        let _ = fs::remove_dir_all(root);
    }
}
