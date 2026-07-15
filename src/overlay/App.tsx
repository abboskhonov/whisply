import { useEffect, useRef, useState } from "react"
import { emit, listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import "./overlay.css"

type OverlayState = "idle" | "recording" | "transcribing" | "denied"

const BARS = 16
const FALLBACK_LEVELS = Array.from(
  { length: BARS },
  (_, index) => 0.18 + 0.08 * Math.sin(index * 0.7)
)

function formatElapsed(seconds: number): string {
  const secondsRounded = Math.max(0, Math.floor(seconds))
  return `${Math.floor(secondsRounded / 60)}:${String(secondsRounded % 60).padStart(2, "0")}`
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>("idle")
  const [levels, setLevels] = useState<number[]>(FALLBACK_LEVELS)
  const [elapsed, setElapsed] = useState(0)
  const [shortcutKey, setShortcutKey] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const elapsedStart = useRef<number | null>(null)

  useEffect(() => {
    const unsubs: Array<() => void> = []
    let mounted = true

    ;(async () => {
      const audioStateUnlisten = await listen<{
        state: OverlayState
        shortcut?: string
        error?: string
      }>("whisply://audio-state", (event) => {
        if (!mounted) return
        const next = event.payload.state
        setState(next)
        if (event.payload.shortcut) setShortcutKey(event.payload.shortcut)
        if (event.payload.error) setErrorMsg(event.payload.error)

        if (next === "recording") {
          elapsedStart.current = performance.now()
        } else {
          elapsedStart.current = null
          setElapsed(0)
          if (next === "idle") setLevels(FALLBACK_LEVELS)
        }
      })
      unsubs.push(audioStateUnlisten)

      const micLevelUnlisten = await listen<{ levels: number[] }>(
        "whisply://mic-level",
        (event) => {
          if (mounted) setLevels(event.payload.levels)
        }
      )
      unsubs.push(micLevelUnlisten)

      await invoke("overlay_ready")
    })().catch((error) => {
      console.error("Failed to initialize overlay listeners:", error)
    })

    return () => {
      mounted = false
      unsubs.forEach((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    if (state !== "recording" || elapsedStart.current == null) return

    let animationFrame = 0
    const tick = () => {
      if (elapsedStart.current != null) {
        setElapsed((performance.now() - elapsedStart.current) / 1000)
        animationFrame = requestAnimationFrame(tick)
      }
    }
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [state])

  const visible = state !== "idle"
  const isRecording = state === "recording"

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
          <div className="ov-state-mark" aria-hidden>
            {isRecording ? (
              <>
                <span className="ov-dot-ping" />
                <span className="ov-dot" />
              </>
            ) : state === "transcribing" ? (
              <span className="ov-spinner" />
            ) : state === "denied" ? (
              <span className="ov-warn">!</span>
            ) : null}
          </div>

          <div className="ov-copy">
            <span
              className={`ov-status ${state === "denied" ? "ov-status-err" : ""}`}
            >
              {isRecording
                ? "Listening"
                : state === "transcribing"
                  ? "Transcribing"
                  : errorMsg || "Microphone blocked"}
            </span>
            {isRecording ? (
              <span className="ov-time">{formatElapsed(elapsed)}</span>
            ) : null}
          </div>

          {isRecording ? (
            <div className="ov-bars" aria-hidden>
              {Array.from({ length: BARS }).map((_, index) => {
                const level = Math.min(1, levels[index] ?? 0)
                const height = Math.max(3, Math.pow(level, 0.6) * 20)
                return (
                  <span
                    key={index}
                    className="ov-bar"
                    style={{ height: `${height}px` }}
                  />
                )
              })}
            </div>
          ) : null}

          <div className="ov-actions">
            {shortcutKey && isRecording ? (
              <span className="ov-kbd">{shortcutKey}</span>
            ) : null}
            {visible ? (
              <button
                type="button"
                className="ov-x"
                onClick={() => void emit("whisply://overlay-cancel", {})}
                aria-label="Cancel dictation"
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
