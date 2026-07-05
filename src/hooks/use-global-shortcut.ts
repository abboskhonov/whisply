import * as React from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { isTauri } from "@/lib/tauri"
import { invoke } from "@tauri-apps/api/core"

export type OverlayState = "idle" | "recording" | "transcribing"

type ShortcutEvent = {
  key: string
  state: "pressed" | "released"
}

type ShortcutConfig = {
  modifiers: string[]
  key: string
}

/// Convert our internal combo format to a Tauri shortcut string.
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

  // Listen for shortcut events from the Rust backend
  React.useEffect(() => {
    if (!isTauri()) return

    let unlisten: UnlistenFn | undefined

    async function setup() {
      unlisten = await listen<ShortcutEvent>("whisply://shortcut", (event) => {
        const { state } = event.payload

        if (state === "pressed") {
          // Toggle between idle and recording for testing
          setOverlayState((prev) =>
            prev === "idle" ? "recording" : "idle"
          )
          // After 3 seconds, simulate transcribing then idle
          if (overlayState === "idle") {
            setTimeout(() => {
              setOverlayState("transcribing")
              setTimeout(() => setOverlayState("idle"), 1500)
            }, 3000)
          }
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
      await invoke("register_global_shortcut", {
        shortcutKey: shortcutStr,
      })
    },
    []
  )

  const unregisterShortcut = React.useCallback(async (combo: ShortcutConfig) => {
    if (!isTauri()) return
    const shortcutStr = comboToShortcutString(combo)
    await invoke("unregister_global_shortcut", {
      shortcutKey: shortcutStr,
    })
  }, [])

  return {
    overlayState,
    shortcutKey,
    registerShortcut,
    unregisterShortcut,
    setOverlayState,
  }
}
