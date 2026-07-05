import * as React from "react"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { isTauri } from "@/lib/tauri"
import {
  startBrowserMic,
  type BrowserMicController,
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

type UseDictationOptions = {
  /**
   * Called whenever a chunk of mono f32 samples arrives from the audio
   * pipeline. Useful for feeding a visual demo.
   */
  onSamples?: (samples: number[]) => void
}

/**
 * A passive observer for the global dictation state machine. In Tauri the
 * Rust side drives the entire lifecycle (shortcut → start capture → show
 * overlay → transcribing → hide), so this hook just listens to the
 * emitted events and exposes the current state to the UI.
 *
 * In the browser (vite dev) we still need an in-app demo path, so this
 * hook also opens a WebAudio analyser when the user clicks the demo
 * button. The Tauri and browser code paths are intentionally separate.
 */
export function useDictation(options: UseDictationOptions = {}) {
  const { onSamples } = options
  const onSamplesRef = React.useRef(onSamples)
  React.useEffect(() => {
    onSamplesRef.current = onSamples
  }, [onSamples])

  const [state, setState] = React.useState<DictationState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [shortcutKey, setShortcutKey] = React.useState<string>("")
  const [elapsed, setElapsed] = React.useState(0)
  const [device, setDevice] = React.useState<string>("")
  const browserMicRef = React.useRef<BrowserMicController | null>(null)
  const elapsedStart = React.useRef<number | null>(null)

  // In Tauri, listen to the state events emitted by the Rust process. The
  // same events drive the global overlay window; we just mirror them here
  // so the main app's UI can react (e.g. show an in-app status pill).
  React.useEffect(() => {
    if (!isTauri()) return
    const unsubs: Array<() => void> = []
    let mounted = true

    // Re-register any persisted shortcut so the rdev listener picks it
    // up on app start (the listener is already running in Rust setup).
    const saved = localStorage.getItem("whisply-shortcut")
    if (saved) {
      try {
        const combo = JSON.parse(saved) as ShortcutConfig
        const key = comboToShortcutString(combo)
        setShortcutKey(key)
        invoke("register_shortcut_evdev", { shortcutKey: key }).catch(
          (err) => {
            console.error("register_shortcut_evdev failed:", err)
          }
        )
      } catch {
        // ignore corrupt localStorage
      }
    }

    ;(async () => {
      const u1 = await listen<{
        state: DictationState
        device?: string
        shortcut?: string
        error?: string
      }>("whisply://audio-state", (e) => {
        if (!mounted) return
        setState(e.payload.state)
        if (e.payload.device) setDevice(e.payload.device)
        if (e.payload.shortcut) setShortcutKey(e.payload.shortcut)
        if (e.payload.error) setError(e.payload.error)
        if (e.payload.state === "recording") {
          elapsedStart.current = performance.now()
        } else {
          elapsedStart.current = null
          setElapsed(0)
        }
      })
      unsubs.push(u1)

      const u2 = await listen<SamplesEvent>("whisply://audio-data", (e) => {
        onSamplesRef.current?.(e.payload.samples)
      })
      unsubs.push(u2)
    })()

    return () => {
      mounted = false
      unsubs.forEach((u) => u())
    }
  }, [])

  // Elapsed-time counter. Local RAF — Rust doesn't push it because it's
  // a 1 Hz signal that would just waste bridge cycles.
  React.useEffect(() => {
    if (state !== "recording" || elapsedStart.current == null) return
    let raf = 0
    const tick = () => {
      if (elapsedStart.current != null) {
        setElapsed((performance.now() - elapsedStart.current) / 1000)
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state])

  // Browser-only: open a MediaStream so the demo panel can show a wave.
  // The Tauri path doesn't use this — Rust owns the mic there.
  const startBrowser = React.useCallback(async () => {
    if (isTauri()) {
      // In Tauri the Rust shortcut handler drives the whole flow. We
      // expose start/stop here just for symmetry / future programmatic
      // recording. For now, the demo panel only triggers in browser mode.
      return
    }
    if (browserMicRef.current) return
    try {
      setError(null)
      const ctrl = await startBrowserMic(
        () => {
          /* levels flow through the controller's getLatestLevels() */
        },
        (samples) => onSamplesRef.current?.(samples)
      )
      browserMicRef.current = ctrl
      setState("recording")
      elapsedStart.current = performance.now()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setState("denied")
    }
  }, [])

  const stopBrowser = React.useCallback(() => {
    if (browserMicRef.current) {
      browserMicRef.current.stop()
      browserMicRef.current = null
    }
    elapsedStart.current = null
    setElapsed(0)
    setState("idle")
  }, [])

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      if (browserMicRef.current) {
        browserMicRef.current.stop()
        browserMicRef.current = null
      }
    }
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

  return {
    state,
    error,
    shortcutKey,
    device,
    elapsed,
    /** Browser-only: open the MediaStream and set state to "recording". */
    start: startBrowser,
    /** Browser-only: stop the MediaStream. */
    stop: stopBrowser,
    registerShortcut,
  }
}
