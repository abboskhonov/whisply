import { trackedInvoke } from "./tauri"
import { isTauri } from "./tauri"

export type DeviceInfo = {
  name: string
  is_default: boolean
}

export type AudioStarted = {
  device: string
  sample_rate: number
  channels: number
}

export type AudioStopped = {
  reason: string
}

export type AudioError = {
  kind: "permission_denied" | "no_input_device" | "unknown"
  message: string
}

export type LevelEvent = {
  seq: number
  /** 16 buckets, each in [0, 1]. */
  levels: number[]
}

export type SamplesEvent = {
  seq: number
  rate: number
  /** Mono f32 samples in [−1, 1]. */
  samples: number[]
}

const BUCKETS = 16
const FALLBACK_LEVELS = new Array(BUCKETS).fill(0) as number[]

/**
 * Native-only: list input devices reported by cpal. Returns `[]` in the browser.
 */
export async function listMicrophones(): Promise<DeviceInfo[]> {
  if (!isTauri()) return []
  return trackedInvoke<DeviceInfo[]>("list_microphones")
}

/**
 * Native-only: open the given (or default) input device and start emitting
 * `whisply://mic-level` and `whisply://audio-data` events.
 */
export async function startAudioCapture(
  deviceName?: string
): Promise<AudioStarted> {
  if (!isTauri()) {
    throw new Error("startAudioCapture requires the native app")
  }
  return trackedInvoke<AudioStarted>("start_audio_capture", {
    deviceName: deviceName ?? null,
  })
}

export async function stopAudioCapture(): Promise<AudioStopped> {
  if (!isTauri()) {
    return { reason: "not_native" }
  }
  return trackedInvoke<AudioStopped>("stop_audio_capture")
}

export async function isCapturing(): Promise<boolean> {
  if (!isTauri()) return false
  return trackedInvoke<boolean>("is_capturing")
}

/**
 * Browser fallback: open a `MediaStream` for the level meter and demo panel.
 * Returns a controller with `stop()` and the most recent level snapshot.
 *
 * Native builds always go through cpal; this exists so the demo and onboarding
 * work in `vite dev` without Tauri.
 */
export type BrowserMicController = {
  stop: () => void
  getLatestLevels: () => number[]
  getLatestSamples: () => number[]
}

export async function startBrowserMic(
  onLevels: (levels: number[]) => void,
  onSamples?: (samples: number[]) => void
): Promise<BrowserMicController> {
  const ctx = new AudioContext()
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.5
  source.connect(analyser)

  const freq = new Uint8Array(analyser.frequencyBinCount)
  const time = new Float32Array(analyser.fftSize)

  let latestLevels = new Array(BUCKETS).fill(0) as number[]
  let latestSamples: number[] = []
  let lastSampleEmit = performance.now()
  const SAMPLE_INTERVAL = 1000 / 16

  let stopped = false
  function tick() {
    if (stopped) return
    analyser.getByteFrequencyData(freq)
    analyser.getFloatTimeDomainData(time)

    const buckets = BUCKETS
    const step = Math.floor(freq.length / buckets)
    const levels: number[] = []
    for (let i = 0; i < buckets; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) {
        const v = freq[i * step + j] / 255
        sum += v * v
      }
      const rms = Math.sqrt(sum / step)
      levels.push(Math.min(1, Math.pow(rms * 3.5, 0.7)))
    }
    latestLevels = levels
    onLevels(levels)

    const now = performance.now()
    if (onSamples && now - lastSampleEmit >= 1000 / SAMPLE_INTERVAL) {
      latestSamples = Array.from(time)
      onSamples(latestSamples)
      lastSampleEmit = now
    }

    requestAnimationFrame(tick)
  }
  tick()

  return {
    stop: () => {
      stopped = true
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
    getLatestLevels: () => latestLevels,
    getLatestSamples: () => latestSamples,
  }
}

export { FALLBACK_LEVELS }
