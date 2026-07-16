use crate::models::ModelFormat;
use serde::{Deserialize, Serialize};
use sherpa_onnx::{
    OfflineNemoEncDecCtcModelConfig, OfflineRecognizer, OfflineRecognizerConfig,
    OfflineTransducerModelConfig,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const MEMORY_SETTINGS_FILE: &str = "model-memory-settings.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ModelMemorySettings {
    pub keep_loaded: bool,
    pub unload_after_minutes: u64,
}

impl Default for ModelMemorySettings {
    fn default() -> Self {
        Self {
            keep_loaded: false,
            unload_after_minutes: 0,
        }
    }
}

impl ModelMemorySettings {
    fn normalized(mut self) -> Self {
        self.unload_after_minutes = self.unload_after_minutes.min(120);
        self
    }
}

struct CachedRecognizer {
    model_dir: PathBuf,
    recognizer: OfflineRecognizer,
}

pub struct TranscriptionState {
    recognizer: Mutex<Option<CachedRecognizer>>,
    memory_settings: Mutex<ModelMemorySettings>,
    unload_revision: AtomicU64,
}

impl TranscriptionState {
    pub fn new() -> Self {
        Self {
            recognizer: Mutex::new(None),
            memory_settings: Mutex::new(ModelMemorySettings::default()),
            unload_revision: AtomicU64::new(0),
        }
    }

    pub fn init(&self, app: &AppHandle) {
        let Ok(path) = memory_settings_path(app) else {
            return;
        };
        let Ok(contents) = fs::read_to_string(&path) else {
            return;
        };
        match serde_json::from_str::<ModelMemorySettings>(&contents) {
            Ok(settings) => {
                if let Ok(mut saved) = self.memory_settings.lock() {
                    *saved = settings.normalized();
                }
            }
            Err(error) => log::warn!("invalid model memory settings at {}: {error}", path.display()),
        }
    }

    pub fn memory_settings(&self) -> ModelMemorySettings {
        self.memory_settings
            .lock()
            .map(|settings| settings.clone())
            .unwrap_or_default()
    }

    pub fn set_memory_settings(
        &self,
        app: &AppHandle,
        settings: ModelMemorySettings,
    ) -> Result<ModelMemorySettings, String> {
        let settings = settings.normalized();
        let path = memory_settings_path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let contents = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
        fs::write(path, contents).map_err(|error| error.to_string())?;
        *self.memory_settings.lock().map_err(|error| error.to_string())? = settings.clone();
        self.unload_revision.fetch_add(1, Ordering::SeqCst);
        if !settings.keep_loaded && settings.unload_after_minutes == 0 {
            self.unload();
        }
        Ok(settings)
    }

    pub fn transcribe(
        &self,
        app: &AppHandle,
        samples: &[f32],
        sample_rate: u32,
    ) -> Result<String, String> {
        let (model_dir, format) = app
            .state::<crate::models::ModelManager>()
            .selected_model(app)?;
        self.transcribe_with_model(&model_dir, format, samples, sample_rate)
    }

    /// Release the loaded recognizer. Speech models are large enough that
    /// keeping one warm makes an otherwise idle app consume close to a gigabyte of RAM.
    pub fn unload(&self) {
        if let Ok(mut cached) = self.recognizer.lock() {
            *cached = None;
            log::info!("unloaded local speech model from memory");
        }
    }

    pub fn schedule_unload(&self, app: AppHandle) {
        let settings = self.memory_settings();
        let revision = self.unload_revision.fetch_add(1, Ordering::SeqCst) + 1;
        if settings.keep_loaded {
            return;
        }
        if settings.unload_after_minutes == 0 {
            self.unload();
            return;
        }

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(settings.unload_after_minutes * 60));
            let transcription = app.state::<TranscriptionState>();
            if transcription.unload_revision.load(Ordering::SeqCst) == revision {
                transcription.unload();
            }
        });
    }

    pub fn transcribe_with_model(
        &self,
        model_dir: &Path,
        format: ModelFormat,
        samples: &[f32],
        sample_rate: u32,
    ) -> Result<String, String> {
        validate_audio(samples, sample_rate)?;
        self.unload_revision.fetch_add(1, Ordering::SeqCst);
        let mut cached = self.recognizer.lock().map_err(|error| error.to_string())?;
        if cached
            .as_ref()
            .is_none_or(|current| current.model_dir != model_dir)
        {
            log::info!("loading local speech model from {}", model_dir.display());
            *cached = Some(CachedRecognizer {
                recognizer: create_recognizer(model_dir, format)?,
                model_dir: model_dir.to_path_buf(),
            });
        }

        let recognizer = &cached.as_ref().expect("recognizer initialized").recognizer;
        let stream = recognizer.create_stream();
        stream.accept_waveform(sample_rate as i32, samples);
        recognizer.decode(&stream);
        let result = stream
            .get_result()
            .ok_or_else(|| "The speech model returned no result".to_string())?;
        Ok(result.text.trim().to_string())
    }
}

fn memory_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(MEMORY_SETTINGS_FILE))
        .map_err(|error| format!("Could not resolve model memory settings path: {error}"))
}

#[tauri::command]
pub fn get_model_memory_settings(
    state: tauri::State<'_, TranscriptionState>,
) -> ModelMemorySettings {
    state.memory_settings()
}

#[tauri::command]
pub fn set_model_memory_settings(
    app: AppHandle,
    settings: ModelMemorySettings,
    state: tauri::State<'_, TranscriptionState>,
) -> Result<ModelMemorySettings, String> {
    state.set_memory_settings(&app, settings)
}

fn validate_audio(samples: &[f32], sample_rate: u32) -> Result<(), String> {
    if samples.is_empty() || sample_rate == 0 {
        Err("No microphone audio was captured".to_string())
    } else {
        Ok(())
    }
}

fn create_recognizer(model_dir: &Path, format: ModelFormat) -> Result<OfflineRecognizer, String> {
    let path = |name: &str| model_dir.join(name).to_string_lossy().into_owned();
    let mut config = OfflineRecognizerConfig::default();
    match format {
        ModelFormat::NemoTransducer => {
            config.model_config.transducer = OfflineTransducerModelConfig {
                encoder: Some(path("encoder.int8.onnx")),
                decoder: Some(path("decoder.int8.onnx")),
                joiner: Some(path("joiner.int8.onnx")),
            };
            config.model_config.model_type = Some("nemo_transducer".to_string());
        }
        ModelFormat::GigaAmCtc => {
            config.feat_config.feature_dim = 64;
            config.model_config.nemo_ctc = OfflineNemoEncDecCtcModelConfig {
                model: Some(path("model.int8.onnx")),
            };
        }
    }
    config.model_config.tokens = Some(path("tokens.txt"));
    config.model_config.provider = Some("cpu".to_string());
    config.model_config.num_threads = std::thread::available_parallelism()
        .map(|threads| threads.get().min(4) as i32)
        .unwrap_or(2);

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "Could not initialize the selected speech model".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_audio_is_rejected_before_model_loading() {
        assert!(validate_audio(&[], 48_000).is_err());
        assert!(validate_audio(&[0.0], 0).is_err());
        assert!(validate_audio(&[0.0], 48_000).is_ok());
    }

    #[test]
    fn transcribes_fixture_when_model_is_provided() {
        let Ok(model_dir) = std::env::var("WHISPLY_TEST_MODEL_DIR") else {
            return;
        };
        let wave_path = Path::new(&model_dir).join("test_wavs/en.wav");
        let wave = sherpa_onnx::Wave::read(&wave_path.to_string_lossy()).expect("read test wave");
        let text = TranscriptionState::new()
            .transcribe_with_model(
                Path::new(&model_dir),
                ModelFormat::NemoTransducer,
                wave.samples(),
                wave.sample_rate() as u32,
            )
            .expect("transcribe test wave");
        assert!(!text.trim().is_empty());
    }

    #[test]
    fn initializes_gigaam_when_model_is_provided() {
        let Ok(model_dir) = std::env::var("WHISPLY_TEST_GIGAAM_MODEL_DIR") else {
            return;
        };
        create_recognizer(Path::new(&model_dir), ModelFormat::GigaAmCtc)
            .expect("initialize GigaAM CTC model");
    }
}
