import * as React from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { isTauri } from "@/lib/tauri"

export type OverlayState = "idle" | "recording" | "transcribing"

type ShortcutEvent = {
  key: string
  state: "pressed" | "released"
}

type ShortcutConfig = {
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

export function useGlobalShortcut() {
  const [overlayState, setOverlayState] = React.useState<OverlayState>("idle")
  const [shortcutKey, setShortcutKey] = React.useState<string>("")
  const listenerStarted = React.useRef(false)

  // Listen for shortcut events from the Rust evdev listener
  React.useEffect(() => {
    if (!isTauri()) return

    let unlisten: UnlistenFn | undefined

    async function setup() {
      // Start the listener once
      if (!listenerStarted.current) {
        await invoke("start_shortcut_listener")
        listenerStarted.current = true
      }

      unlisten = await listen<ShortcutEvent>("whisply://shortcut", (event) => {
        const { state } = event.payload

        if (state === "pressed") {
          setOverlayState((prev) => {
            if (prev === "idle") {
              // Start recording, then auto-cycle after 3s
              setTimeout(() => {
                setOverlayState("transcribing")
                setTimeout(() => setOverlayState("idle"), 1500)
              }, 3000)
              return "recording"
            }
            // Toggle off
            return "idle"
          })
        }
      })
    }

    setup()

    return () => {
      unlisten?.()
    }
  }, [])

  const registerShortcut = React.useCallback(
    async (combo: ShortcutConfig) => {
      if (!isTauri()) return
      const shortcutStr = comboToShortcutString(combo)
      setShortcutKey(shortcutStr)
      await invoke("register_shortcut_evdev", {
        shortcutKey: shortcutStr,
      })
    },
    []
  )

  const unregisterShortcut = React.useCallback(
    async (combo: ShortcutConfig) => {
      if (!isTauri()) return
      const shortcutStr = comboToShortcutString(combo)
      await invoke("unregister_shortcut_evdev", {
        shortcutKey: shortcutStr,
      })
    },
    []
  )

  return {
    overlayState,
    shortcutKey,
    registerShortcut,
    unregisterShortcut,
    setOverlayState,
  }
}
