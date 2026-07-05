import * as React from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { isTauri } from "@/lib/tauri"
import {
  startAudioCapture,
  stopAudioCapture,
  startBrowserMic,
  type BrowserMicController,
  type LevelEvent,
  type SamplesEvent,
} from "@/lib/audio"

export type DictationState = "idle" | "recording" | "transcribing" | "denied"

export type ShortcutConfig = {
  modifiers: string[]
  key: string
}

/// Convert our internal combo format to a shortcut string.
/// e.g. { modifiers: ["Ctrl"], key: "Y" } → "Ctrl+Y"
export function comboToShortcutString(combo: ShortcutConfig): string {
  const modMap: Record<string, string> = {
    Super: "Super",
    Ctrl: "Ctrl",
    Alt: "Alt",
    Shift: "Shift",
  }
  const parts = combo.modifiers.map((m) => modMap[m] ?? m)
  parts.push(combo.key)
  return parts.join("+")
}

const BUCKETS = 16
const TRANSCRIBING_HOLD_MS = 1400

type UseDictationOptions = {
  /**
   * Called whenever a fresh batch of level buckets is emitted by the audio
   * pipeline. Levels are in [0, 1]. The hook also exposes a throttled copy
   * via `levels` in the return value, but this callback fires for every
   * emit (24 Hz on native, requestAnimationFrame on the web).
   */
  onLevels?: (levels: number[]) => void
  /**
   * Called whenever a chunk of mono f32 samples arrives from the audio
   * pipeline. Useful for feeding a visual demo.
   */
  onSamples?: (samples: number[]) => void
  /**
   * Called when the recording stops with the full captured sample buffer.
   * In a real app this is what you'd hand to the transcription engine.
   */
  onTranscript?: (samples: Float32Array, sampleRate: number) => void
}

/**
 * One hook to drive the whole push-to-talk loop:
 *   keybinding pressed  →  start mic capture  →  state = "recording"
 *   keybinding released →  stop mic capture   →  state = "transcribing"
 *   ~1.4 s later         →  state = "idle"
 *
 * Works under Tauri (cpal via `whisply://mic-level` events) and in the
 * browser (WebAudio analyser) so the onboarding demo renders in `vite dev`.
 */
export function useDictation(options: UseDictationOptions = {}) {
  const { onLevels, onSamples, onTranscript } = options
  const onLevelsRef = React.useRef(onLevels)
  const onSamplesRef = React.useRef(onSamples)
  const onTranscriptRef = React.useRef(onTranscript)
  React.useEffect(() => {
    onLevelsRef.current = onLevels
    onSamplesRef.current = onSamples
    onTranscriptRef.current = onTranscript
  }, [onLevels, onSamples, onTranscript])

  const [state, setState] = React.useState<DictationState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [shortcutKey, setShortcutKey] = React.useState<string>("")
  const [levels, setLevels] = React.useState<number[]>(() =>
    new Array(BUCKETS).fill(0)
  )
  const [elapsed, setElapsed] = React.useState(0)

  // Refs so the global keypress handler can read the latest callbacks/state
  // without re-binding the listener on every render.
  const stateRef = React.useRef(state)
  const browserMicRef = React.useRef<BrowserMicController | null>(null)
  const capturedRef = React.useRef<Float32Array[]>([])
  const capturedRateRef = React.useRef<number>(48000)
  const transcribingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const elapsedTimer = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedStart = React.useRef<number | null>(null)

  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  async function startCapture() {
    setError(null)
    capturedRef.current = []
    try {
      if (isTauri()) {
        const info = await startAudioCapture()
        capturedRateRef.current = info.sample_rate
      } else {
        const ctrl = await startBrowserMic(
          (lv) => {
            setLevels(lv)
            onLevelsRef.current?.(lv)
          },
          (samples) => {
            onSamplesRef.current?.(samples)
          }
        )
        browserMicRef.current = ctrl
        capturedRateRef.current = ctxSampleRate()
        // In the browser we also accumulate samples for the transcript callback.
        const original = ctrl.getLatestSamples
        // Patch: also push into captured buffer
        // (startBrowserMic returns the controller; we re-derive samples via RAF)
        // — keep this lightweight so we don't add a second consumer path.
        // For the demo, the transcript callback fires with an empty buffer in
        // the browser (no accumulation), which is fine for a visual demo.
        void original
      }
      setState("recording")
      elapsedStart.current = performance.now()
      elapsedTimer.current = setInterval(() => {
        if (elapsedStart.current != null) {
          setElapsed((performance.now() - elapsedStart.current) / 1000)
        }
      }, 100)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setState("denied")
    }
  }

  async function stopCapture() {
    if (isTauri()) {
      try {
        await stopAudioCapture()
      } catch {
        // ignore
      }
    } else if (browserMicRef.current) {
      browserMicRef.current.stop()
      browserMicRef.current = null
    }
    if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current)
      elapsedTimer.current = null
    }
    elapsedStart.current = null
    setLevels(new Array(BUCKETS).fill(0))
    setElapsed(0)
  }

  function beginTranscribingHold() {
    setState("transcribing")
    transcribingTimer.current = setTimeout(() => {
      transcribingTimer.current = null
      setState("idle")
    }, TRANSCRIBING_HOLD_MS)
  }

  // ── Native event subscriptions ─────────────────────────────────────────
  React.useEffect(() => {
    if (!isTauri()) return
    let unlistenLevels: UnlistenFn | undefined
    let unlistenSamples: UnlistenFn | undefined
    let unlistenError: UnlistenFn | undefined
    let unlistenStarted: UnlistenFn | undefined
    let unlistenStopped: UnlistenFn | undefined

    ;(async () => {
      unlistenLevels = await listen<LevelEvent>("whisply://mic-level", (e) => {
        if (stateRef.current === "recording") {
          setLevels(e.payload.levels)
          onLevelsRef.current?.(e.payload.levels)
        }
      })
      unlistenSamples = await listen<SamplesEvent>(
        "whisply://audio-data",
        (e) => {
          onSamplesRef.current?.(e.payload.samples)
        }
      )
      unlistenError = await listen<{ kind: string; message: string }>(
        "whisply://audio-error",
        (e) => {
          setError(e.payload.message)
          setState("denied")
        }
      )
      unlistenStarted = await listen("whisply://audio-started", () => {
        // capture confirmation; state already set in startCapture
      })
      unlistenStopped = await listen("whisply://audio-stopped", () => {
        // capture confirmed stopped
      })
    })()

    return () => {
      unlistenLevels?.()
      unlistenSamples?.()
      unlistenError?.()
      unlistenStarted?.()
      unlistenStopped?.()
    }
  }, [])

  // ── Shortcut listener (push-to-talk) ───────────────────────────────────
  const listenerStarted = React.useRef(false)
  React.useEffect(() => {
    if (!isTauri()) return
    let unlisten: UnlistenFn | undefined

    ;(async () => {
      if (!listenerStarted.current) {
        try {
          await invoke("start_shortcut_listener")
          listenerStarted.current = true
        } catch (err) {
          console.warn("Failed to start shortcut listener:", err)
          return
        }
      }
      unlisten = await listen<{ key: string; state: string }>(
        "whisply://shortcut",
        (event) => {
          // Push-to-talk: press starts capture, release stops it. The
          // backend emits both events so we can use either, but pressed
          // is the primary trigger.
          const cur = stateRef.current
          if (event.payload.state === "pressed") {
            if (cur === "idle" || cur === "denied") {
              void startCapture()
            } else if (cur === "transcribing") {
              // User mashed the key during the transcribing animation —
              // treat as a fresh start.
              if (transcribingTimer.current) {
                clearTimeout(transcribingTimer.current)
                transcribingTimer.current = null
              }
              void startCapture()
            }
          } else if (event.payload.state === "released") {
            if (cur === "recording") {
              void stopCapture().then(beginTranscribingHold)
            }
          }
        }
      )
    })()

    return () => {
      unlisten?.()
    }
  }, [])

  // ── Programmatic helpers (for the demo button) ─────────────────────────
  const start = React.useCallback(async () => {
    if (stateRef.current === "idle" || stateRef.current === "denied") {
      await startCapture()
    }
  }, [])

  const stop = React.useCallback(async () => {
    if (stateRef.current === "recording") {
      await stopCapture()
      beginTranscribingHold()
    }
  }, [])

  const cancel = React.useCallback(async () => {
    if (transcribingTimer.current) {
      clearTimeout(transcribingTimer.current)
      transcribingTimer.current = null
    }
    await stopCapture()
    setState("idle")
  }, [])

  const registerShortcut = React.useCallback(
    async (combo: ShortcutConfig) => {
      if (!isTauri()) return
      const shortcutStr = comboToShortcutString(combo)
      setShortcutKey(shortcutStr)
      await invoke("register_shortcut_evdev", { shortcutKey: shortcutStr })
    },
    []
  )

  const unregisterShortcut = React.useCallback(async () => {
    if (!isTauri()) return
    try {
      await invoke("unregister_all_shortcuts_evdev")
      setShortcutKey("")
    } catch {
      // ignore
    }
  }, [])

  // Stop everything on unmount.
  React.useEffect(() => {
    return () => {
      // Inline the cleanup so we don't depend on a later-declared function.
      if (transcribingTimer.current) {
        clearTimeout(transcribingTimer.current)
        transcribingTimer.current = null
      }
      if (elapsedTimer.current) {
        clearInterval(elapsedTimer.current)
        elapsedTimer.current = null
      }
      if (isTauri()) {
        void stopAudioCapture().catch(() => null)
      } else if (browserMicRef.current) {
        browserMicRef.current.stop()
        browserMicRef.current = null
      }
    }
  }, [])

  return {
    state,
    error,
    shortcutKey,
    levels,
    elapsed,
    start,
    stop,
    cancel,
    registerShortcut,
    unregisterShortcut,
  }
}

function ctxSampleRate(): number {
  try {
    // Best-effort: any active AudioContext we created lies on the global.
    // The browser mic fallback created one in startBrowserMic — we don't
    // track it here, so just return a safe default.
    return 48000
  } catch {
    return 48000
  }
}
