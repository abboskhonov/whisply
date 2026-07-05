use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// How many spectrum buckets to compute and emit. Lower = cheaper, less detail.
const LEVEL_BUCKETS: usize = 16;
/// How often we emit level events (Hz). 24 Hz is smooth without flooding the bridge.
const LEVEL_EMIT_HZ: u32 = 24;
/// How often we emit accumulated audio data for the demo (Hz). 16 Hz is fine for a visual demo.
const SAMPLE_EMIT_HZ: u32 = 16;

#[derive(Clone, Debug, Serialize)]
pub struct DeviceInfo {
    pub name: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct AudioStarted {
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Clone, Debug, Serialize)]
pub struct AudioStopped {
    pub reason: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct AudioError {
    pub kind: String,
    pub message: String,
}

pub struct AudioState {
    pub stream: Mutex<Option<cpal::Stream>>,
    pub config: Mutex<Option<cpal::SupportedStreamConfig>>,
    pub device_name: Mutex<Option<String>>,
    pub capturing: AtomicBool,
    pub level_seq: AtomicU64,
    pub sample_seq: AtomicU64,
    /// Frame counter for the "first samples arrived" debug log.
    pub frame_count: AtomicU64,
    /// Per-bucket smoothed RMS levels in [0, 1]. Frontend reads these via
    /// the `whisply://mic-level` event.
    pub smoothed_levels: Mutex<[f32; LEVEL_BUCKETS]>,
    /// Rolling buffer of recent samples for the visual demo. 16 kHz mono,
    /// flushed at SAMPLE_EMIT_HZ to the frontend over `whisply://audio-data`.
    pub sample_buffer: Mutex<Vec<f32>>,
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            stream: Mutex::new(None),
            config: Mutex::new(None),
            device_name: Mutex::new(None),
            capturing: AtomicBool::new(false),
            level_seq: AtomicU64::new(0),
            sample_seq: AtomicU64::new(0),
            frame_count: AtomicU64::new(0),
            smoothed_levels: Mutex::new([0.0; LEVEL_BUCKETS]),
            sample_buffer: Mutex::new(Vec::with_capacity(8192)),
        }
    }
}

fn classify_error(msg: &str) -> &'static str {
    let lower = msg.to_lowercase();
    if lower.contains("permission denied")
        || lower.contains("access denied")
        || lower.contains("access is denied")
    {
        "permission_denied"
    } else if lower.contains("no input device") || lower.contains("not found") {
        "no_input_device"
    } else {
        "unknown"
    }
}

fn emit_error(app: &AppHandle, kind: &str, message: &str) {
    let _ = app.emit(
        "whisply://audio-error",
        AudioError {
            kind: kind.to_string(),
            message: message.to_string(),
        },
    );
}

fn list_input_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let Ok(devices) = host.input_devices() else {
        return Vec::new();
    };
    let default = host.default_input_device().and_then(|d| d.name().ok());

    devices
        .filter_map(|d| d.name().ok())
        .map(|name| DeviceInfo {
            is_default: Some(&name) == default.as_ref(),
            name,
        })
        .collect()
}

#[tauri::command]
pub fn list_microphones() -> Vec<DeviceInfo> {
    list_input_devices()
}

#[tauri::command]
pub fn start_audio_capture(app: AppHandle, device_name: Option<String>) -> Result<AudioStarted, String> {
    let state = app.state::<Arc<AudioState>>();

    // Already running? No-op.
    if state.capturing.load(Ordering::SeqCst) {
        let cfg = state.config.lock().unwrap().clone();
        let dev = state.device_name.lock().unwrap().clone().unwrap_or_default();
        return Ok(AudioStarted {
            device: dev,
            sample_rate: cfg.as_ref().map(|c| c.sample_rate().0).unwrap_or(0),
            channels: cfg.as_ref().map(|c| c.channels()).unwrap_or(0),
        });
    }

    let host = cpal::default_host();
    let device = if let Some(ref want) = device_name {
        host.input_devices()
            .map_err(|e| format!("Failed to enumerate input devices: {e}"))?
            .find(|d| d.name().ok().as_deref() == Some(want.as_str()))
            .ok_or_else(|| format!("Microphone '{want}' not found"))?
    } else {
        host.default_input_device()
            .ok_or_else(|| "No default input device found".to_string())?
    };

    let device_label = device.name().unwrap_or_else(|_| "Unknown".into());

    // Prefer F32 at the device's default rate; fall back to whatever the device
    // offers. Match cpal's default stream so we never ask the host to resample.
    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {e}"))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    let sample_format = config.sample_format();

    log::info!(
        "audio capture: device={} rate={} channels={} format={:?}",
        device_label,
        sample_rate,
        channels,
        sample_format
    );

    let started = AudioStarted {
        device: device_label.clone(),
        sample_rate,
        channels: channels as u16,
    };

    let app_handle = app.clone();
    let state_for_thread = (*state).clone();
    let stream_config: cpal::StreamConfig = config.clone().into();

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            build_input_stream::<f32>(&device, &stream_config, app_handle, state_for_thread)
        }
        cpal::SampleFormat::I16 => {
            build_input_stream::<i16>(&device, &stream_config, app_handle, state_for_thread)
        }
        cpal::SampleFormat::I32 => {
            build_input_stream::<i32>(&device, &stream_config, app_handle, state_for_thread)
        }
        cpal::SampleFormat::U8 => {
            build_input_stream::<u8>(&device, &stream_config, app_handle, state_for_thread)
        }
        cpal::SampleFormat::I8 => {
            build_input_stream::<i8>(&device, &stream_config, app_handle, state_for_thread)
        }
        other => return Err(format!("Unsupported sample format: {other:?}")),
    }
    .map_err(|e| {
        let kind = classify_error(&e.to_string());
        emit_error(&app, kind, &e.to_string());
        e.to_string()
    })?;

    stream
        .play()
        .map_err(|e| format!("Failed to start audio stream: {e}"))?;

    *state.stream.lock().unwrap() = Some(stream);
    *state.device_name.lock().unwrap() = Some(device_label.clone());
    *state.config.lock().unwrap() = Some(cpal::SupportedStreamConfig::new(
        channels as u16,
        config.sample_rate(),
        config.buffer_size().clone(),
        sample_format,
    ));
    state.capturing.store(true, Ordering::SeqCst);
    state.frame_count.store(0, Ordering::SeqCst);
    state.smoothed_levels.lock().unwrap().fill(0.0);
    state.sample_buffer.lock().unwrap().clear();

    let _ = app.emit("whisply://audio-started", started.clone());
    Ok(started)
}

#[tauri::command]
pub fn stop_audio_capture(app: AppHandle) -> Result<AudioStopped, String> {
    let state = app.state::<Arc<AudioState>>();
    if !state.capturing.load(Ordering::SeqCst) {
        return Ok(AudioStopped {
            reason: "not_running".into(),
        });
    }
    state.capturing.store(false, Ordering::SeqCst);
    // Dropping the stream stops capture. We move it out of the lock to drop
    // without holding the lock (Stream may have its own drop guard).
    let stream = state.stream.lock().unwrap().take();
    drop(stream);
    state.smoothed_levels.lock().unwrap().fill(0.0);
    let stopped = AudioStopped {
        reason: "user".into(),
    };
    let _ = app.emit("whisply://audio-stopped", &stopped);
    Ok(stopped)
}

#[tauri::command]
pub fn is_capturing(app: AppHandle) -> bool {
    app.state::<Arc<AudioState>>()
        .capturing
        .load(Ordering::SeqCst)
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    app: AppHandle,
    state: Arc<AudioState>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: Sample + SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    // Own the config so the stream callback (which needs 'static) doesn't
    // borrow from this function's stack frame.
    let config = config.clone();
    // Time-gated emitters so we cap the per-callback work regardless of how
    // chunky the cpal buffer is.
    let level_interval = Duration::from_micros(1_000_000 / LEVEL_EMIT_HZ as u64);
    let sample_interval = Duration::from_micros(1_000_000 / SAMPLE_EMIT_HZ as u64);

    // Throttle state lives in atomic timestamps so we don't take a Mutex on
    // every audio frame.
    let last_level_emit = Arc::new(Mutex::new(Instant::now() - level_interval));
    let last_sample_emit = Arc::new(Mutex::new(Instant::now() - sample_interval));

    let err_fn = |err| log::error!("audio stream error: {err}");

    let channels = config.channels as usize;

    let stream_cb = move |data: &[T], _: &cpal::InputCallbackInfo| {
        if !state.capturing.load(Ordering::Relaxed) {
            return;
        }

        // 1) Down-mix to mono f32 in [−1, 1] and copy into the sample buffer.
        //    The sample buffer feeds the visual demo (and would feed a future
        //    transcription model).
        let mut mono: Vec<f32> = Vec::with_capacity(data.len() / channels.max(1));
        if channels == 1 {
            for &s in data {
                mono.push(f32::from_sample(s));
            }
        } else {
            for frame in data.chunks_exact(channels) {
                let mut sum = 0.0f32;
                for &s in frame {
                    sum += f32::from_sample(s);
                }
                mono.push(sum / channels as f32);
            }
        }

        {
            let mut buf = state.sample_buffer.lock().unwrap();
            buf.extend_from_slice(&mono);
        }

        // 2) Compute per-bucket RMS levels.  We chunk the buffer into
        //    LEVEL_BUCKETS equal slices and take the RMS of each slice — that
        //    gives a coarse spectrum proxy without needing an FFT (we want
        //    this cheap enough to run on every callback).
        let mut levels = [0.0f32; LEVEL_BUCKETS];
        let chunk = mono.len() / LEVEL_BUCKETS;
        if chunk > 0 {
            for (i, slot) in levels.iter_mut().enumerate() {
                let start = i * chunk;
                let end = if i == LEVEL_BUCKETS - 1 {
                    mono.len()
                } else {
                    start + chunk
                };
                let slice = &mono[start..end];
                let rms = (slice.iter().map(|s| s * s).sum::<f32>() / slice.len() as f32).sqrt();
                // Map RMS in [0, ~0.3] to [0, 1] with a soft curve so speech
                // sits comfortably in the upper half of the meter.
                *slot = (rms * 3.5).clamp(0.0, 1.0).powf(0.7);
            }
        }

        // 3) Smooth + emit at LEVEL_EMIT_HZ. We mutate shared state in a tight
        //    lock window so the frontend never sees a half-updated array.
        let now = Instant::now();
        let mut last = last_level_emit.lock().unwrap();
        if now.duration_since(*last) >= level_interval {
            *last = now;
            let mut smoothed = state.smoothed_levels.lock().unwrap();
            for (i, l) in levels.iter().enumerate() {
                smoothed[i] = smoothed[i] * 0.55 + l * 0.45;
            }
            let seq = state.level_seq.fetch_add(1, Ordering::Relaxed);
            let _ = app.emit(
                "whisply://mic-level",
                LevelEvent {
                    seq,
                    levels: *smoothed,
                },
            );
        }

        // 4) Flush accumulated samples to the frontend at SAMPLE_EMIT_HZ. The
        //    frontend uses this for the visual waveform demo; we don't ship
        //    the whole stream.
        let now = Instant::now();
        let mut last = last_sample_emit.lock().unwrap();
        if now.duration_since(*last) >= sample_interval {
            *last = now;
            let mut buf = state.sample_buffer.lock().unwrap();
            if !buf.is_empty() {
                // Cap a single payload to keep bridge traffic bounded. 16 kHz
                // × 1 s would be 16000 samples; we cap at 4× that for safety
                // in case a long cpal buffer delayed the throttle.
                let take = buf.len().min(32_000);
                let payload: Vec<f32> = buf.drain(..take).collect();
                let seq = state.sample_seq.fetch_add(1, Ordering::Relaxed);
                let _ = app.emit(
                    "whisply://audio-data",
                    SamplesEvent {
                        seq,
                        rate: config.sample_rate.0,
                        samples: payload,
                    },
                );
            }
        }

        state.frame_count.fetch_add(1, Ordering::Relaxed);
    };

    device.build_input_stream(&config, stream_cb, err_fn, None)
}

#[derive(Clone, Debug, Serialize)]
struct LevelEvent {
    seq: u64,
    levels: [f32; LEVEL_BUCKETS],
}

#[derive(Clone, Debug, Serialize)]
struct SamplesEvent {
    seq: u64,
    rate: u32,
    samples: Vec<f32>,
}
