import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import {
  OVERLAY_THEME_CHANGED_EVENT,
  overlayPosition,
  overlayTheme,
  type OverlayPosition,
  type OverlayTheme,
} from "@/lib/preferences"
import "./overlay.css"

type OverlayState = "idle" | "recording" | "transcribing" | "denied"

const BARS = 7
const FALLBACK_LEVELS = Array.from(
  { length: BARS },
  (_, index) => 0.18 + 0.08 * Math.sin(index * 0.7)
)

function errorLabel(message: string) {
  if (
    message.toLowerCase().includes("no speech") ||
    message.toLowerCase().includes("no microphone audio")
  ) {
    return "No words heard"
  }

  return "Couldn't hear that"
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>("idle")
  const [levels, setLevels] = useState<number[]>(FALLBACK_LEVELS)
  const [errorMessage, setErrorMessage] = useState("")
  const [theme, setTheme] = useState<OverlayTheme>(overlayTheme)
  const [position, setPosition] = useState<OverlayPosition>(overlayPosition)

  useEffect(() => {
    const unsubs: Array<() => void> = []
    let mounted = true

    ;(async () => {
      const audioStateUnlisten = await listen<{
        state: OverlayState
        error?: string
      }>(
        "whisply://audio-state",
        (event) => {
          if (!mounted) return
          setState(event.payload.state)
          setErrorMessage(event.payload.error ?? "")
          if (event.payload.state === "idle") setLevels(FALLBACK_LEVELS)
        }
      )
      unsubs.push(audioStateUnlisten)

      const micLevelUnlisten = await listen<{ levels: number[] }>(
        "whisply://mic-level",
        (event) => {
          if (mounted) setLevels(event.payload.levels)
        }
      )
      unsubs.push(micLevelUnlisten)

      const themeUnlisten = await listen<OverlayTheme>(
        OVERLAY_THEME_CHANGED_EVENT,
        (event) => setTheme(event.payload)
      )
      unsubs.push(themeUnlisten)

      const positionUnlisten = await listen<OverlayPosition>(
        "whisply://overlay-position",
        (event) => setPosition(event.payload)
      )
      unsubs.push(positionUnlisten)

      await invoke("overlay_ready")
    })().catch((error) => {
      console.error("Failed to initialize overlay listeners:", error)
    })

    return () => {
      mounted = false
      unsubs.forEach((unlisten) => unlisten())
    }
  }, [])

  const visible = state !== "idle"

  return (
    <div
      className="ov-stage"
      data-state={state}
      data-visible={visible ? "true" : "false"}
      data-theme={theme}
      data-position={position}
    >
      <div
        className={`ov-pill ${visible ? "is-open" : "is-closed"} ${
          state === "denied" ? "is-message" : ""
        }`}
        aria-label={
          state === "recording"
            ? "Recording in progress"
            : state === "transcribing"
              ? "Transcribing recording. Press Escape to discard."
              : errorLabel(errorMessage)
        }
      >
        {state === "recording" ? (
          <div className="ov-bars" aria-hidden>
            {Array.from({ length: BARS }).map((_, index) => {
              const level = Math.min(1, (levels[index] ?? 0) * 2.25)
              const scale = Math.max(0.18, Math.pow(level, 0.45))
              return (
                <span
                  key={index}
                  className="ov-bar"
                  style={{ transform: `scaleY(${scale})` }}
                />
              )
            })}
          </div>
        ) : state === "transcribing" ? (
          <div className="ov-bars is-loading" aria-hidden>
            {Array.from({ length: BARS }).map((_, index) => (
              <span key={index} className="ov-bar" />
            ))}
          </div>
        ) : (
          <span className="ov-error-message">{errorLabel(errorMessage)}</span>
        )}
      </div>
    </div>
  )
}
