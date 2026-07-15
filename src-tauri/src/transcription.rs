use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig,
};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

struct CachedRecognizer {
    model_dir: PathBuf,
    recognizer: OfflineRecognizer,
}

pub struct TranscriptionState {
    recognizer: Mutex<Option<CachedRecognizer>>,
}

impl TranscriptionState {
    pub fn new() -> Self {
        Self {
            recognizer: Mutex::new(None),
        }
    }

    pub fn transcribe(
        &self,
        app: &AppHandle,
        samples: &[f32],
        sample_rate: u32,
    ) -> Result<String, String> {
        let model_dir = app
            .state::<crate::models::ModelManager>()
            .selected_model_dir(app)?;
        self.transcribe_with_model(&model_dir, samples, sample_rate)
    }

    /// Release the loaded recognizer once a dictation finishes. The Parakeet
    /// model is large enough that keeping it warm makes an otherwise idle app
    /// consume close to a gigabyte of RAM.
    pub fn unload(&self) {
        if let Ok(mut cached) = self.recognizer.lock() {
            *cached = None;
            log::info!("unloaded local speech model from memory");
        }
    }

    pub fn transcribe_with_model(
        &self,
        model_dir: &Path,
        samples: &[f32],
        sample_rate: u32,
    ) -> Result<String, String> {
        validate_audio(samples, sample_rate)?;
        let mut cached = self.recognizer.lock().map_err(|error| error.to_string())?;
        if cached
            .as_ref()
            .is_none_or(|current| current.model_dir != model_dir)
        {
            log::info!("loading local speech model from {}", model_dir.display());
            *cached = Some(CachedRecognizer {
                recognizer: create_recognizer(model_dir)?,
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

fn validate_audio(samples: &[f32], sample_rate: u32) -> Result<(), String> {
    if samples.is_empty() || sample_rate == 0 {
        Err("No microphone audio was captured".to_string())
    } else {
        Ok(())
    }
}

fn create_recognizer(model_dir: &Path) -> Result<OfflineRecognizer, String> {
    let path = |name: &str| model_dir.join(name).to_string_lossy().into_owned();
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.transducer = OfflineTransducerModelConfig {
        encoder: Some(path("encoder.int8.onnx")),
        decoder: Some(path("decoder.int8.onnx")),
        joiner: Some(path("joiner.int8.onnx")),
    };
    config.model_config.tokens = Some(path("tokens.txt"));
    config.model_config.model_type = Some("nemo_transducer".to_string());
    config.model_config.provider = Some("cpu".to_string());
    config.model_config.num_threads = std::thread::available_parallelism()
        .map(|threads| threads.get().min(4) as i32)
        .unwrap_or(2);

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "Could not initialize the selected Parakeet model".to_string())
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
                wave.samples(),
                wave.sample_rate() as u32,
            )
            .expect("transcribe test wave");
        assert!(!text.trim().is_empty());
    }
}
