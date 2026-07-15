import { useEffect, useState, useRef } from "react"
import { listen, emit } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import "./overlay.css"

/**
 * The global recording overlay. Rendered inside its own transparent Tauri
 * window (label = "recording_overlay") that floats on top of every other
 * app on the user's desktop. The main process drives this component by
 * emitting two events:
 *
 *   whisply://audio-state   { state: "recording" | "transcribing" | "idle", ... }
 *   whisply://mic-level     { levels: number[16] }   // 24 Hz
 *
 * The overlay sends back two events the main process uses for UX polish:
 *
 *   whisply://overlay-clicked-cancel
 *   whisply://overlay-clicked-toggle
 *
 * Both events are scoped to the overlay window via emit_to in Rust, so
 * they don't fire for the main app's webview.
 */

type OverlayState = "idle" | "recording" | "transcribing" | "denied"

const BARS = 16
const FALLBACK_LEVELS = Array.from({ length: BARS }, (_, i) =>
  0.18 + 0.08 * Math.sin(i * 0.7)
)

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>("idle")
  const [levels, setLevels] = useState<number[]>(FALLBACK_LEVELS)
  const [elapsed, setElapsed] = useState(0)
  const [shortcutKey, setShortcutKey] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const elapsedStart = useRef<number | null>(null)

  // Audio state machine events from the main process.
  useEffect(() => {
    const unsubs: Array<() => void> = []
    let mounted = true

    ;(async () => {
      const u1 = await listen<{
        state: OverlayState
        device?: string
        shortcut?: string
        error?: string
      }>("whisply://audio-state", (e) => {
        if (!mounted) return
        const next = e.payload.state
        setState(next)
        if (e.payload.shortcut) setShortcutKey(e.payload.shortcut)
        if (e.payload.error) setErrorMsg(e.payload.error)
        if (next === "recording") {
          elapsedStart.current = performance.now()
        } else {
          elapsedStart.current = null
          setElapsed(0)
          if (next === "idle") setLevels(FALLBACK_LEVELS)
        }
      })
      unsubs.push(u1)

      const u2 = await listen<{ levels: number[] }>(
        "whisply://mic-level",
        (e) => {
          if (!mounted) return
          setLevels(e.payload.levels)
        }
      )
      unsubs.push(u2)

      // Rust may receive the global shortcut before React mounts. Signal
      // readiness only after both listeners exist so any deferred state is
      // delivered to a real subscriber rather than lost at page-load time.
      await invoke("overlay_ready")
    })().catch((error) => {
      console.error("Failed to initialize overlay listeners:", error)
    })

    return () => {
      mounted = false
      unsubs.forEach((u) => u())
    }
  }, [])

  // Drive the elapsed counter locally; the main process doesn't push it
  // because it changes at 1 Hz and would just waste bridge cycles.
  useEffect(() => {
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

  const visible = state !== "idle"

  const handleCancel = () => {
    void emit("whisply://overlay-cancel", {})
  }

  return (
    <div
      className="ov-stage"
      data-state={state}
      data-visible={visible ? "true" : "false"}
    >
      <div
        className={`ov-pill ${visible ? "is-open" : "is-closed"}`}
        role="status"
        aria-live="polite"
      >
        <div className="ov-pill-inner">
          <div className="ov-left">
            {state === "recording" ? (
              <div className="ov-dot-wrap">
                <span className="ov-dot-ping" />
                <span className="ov-dot" />
              </div>
            ) : state === "transcribing" ? (
              <span className="ov-spinner" />
            ) : state === "denied" ? (
              <span className="ov-warn">!</span>
            ) : null}
          </div>

          <div className="ov-center">
            <div className="ov-bars" aria-hidden>
              {Array.from({ length: BARS }).map((_, i) => {
                const v = state === "recording" ? Math.min(1, levels[i] ?? 0) : 0
                const perceptual = Math.pow(v, 0.6)
                const h = Math.max(2, perceptual * 22)
                return (
                  <span
                    key={i}
                    className={`ov-bar ${state === "recording" ? "is-active" : ""}`}
                    style={{ height: `${h}px` }}
                  />
                )
              })}
            </div>
          </div>

          <div className="ov-right">
            <div className="ov-label">
              {state === "recording" ? (
                <>
                  <span className="ov-status">Listening</span>
                  <span className="ov-time">{formatElapsed(elapsed)}</span>
                </>
              ) : state === "transcribing" ? (
                <span className="ov-status">Transcribing…</span>
              ) : state === "denied" ? (
                <span className="ov-status ov-status-err">
                  {errorMsg || "Microphone blocked"}
                </span>
              ) : null}
            </div>
            {shortcutKey && state === "recording" ? (
              <span className="ov-kbd">{shortcutKey}</span>
            ) : null}
            {visible ? (
              <button
                type="button"
                className="ov-x"
                onClick={handleCancel}
                aria-label="Cancel"
              >
                <svg viewBox="0 0 12 12" aria-hidden>
                  <path
                    d="M2 2 L10 10 M10 2 L2 10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
