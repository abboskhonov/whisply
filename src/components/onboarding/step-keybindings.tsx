import * as React from "react"
import {
  Keyboard,
  Check,
  Hand,
  ToggleLeft,
  CornersOut,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isTauri } from "@/lib/tauri"
import { invoke } from "@tauri-apps/api/core"

type Modifier = "Super" | "Ctrl" | "Alt" | "Shift"

type KeyCombo = {
  modifiers: Modifier[]
  key: string
}

type TriggerMode = "hold" | "toggle"

const DEFAULT_COMBO: KeyCombo = {
  modifiers: ["Super"],
  key: "V",
}

const DEFAULT_MODE: TriggerMode = "hold"

const MODIFIER_LABELS: Record<string, string> = {
  Super: "⊞ Win",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
}

function comboToString(combo: KeyCombo): string {
  const modMap: Record<string, string> = {
    Super: "Super",
    Ctrl: "Ctrl",
    Alt: "Alt",
    Shift: "Shift",
  }
  return [...combo.modifiers.map((m) => modMap[m] ?? m), combo.key].join("+")
}

type StepKeybindingsProps = {
  onNext: () => void
  onBack: () => void
}

type ModeOption = {
  id: TriggerMode
  label: string
  description: string
  icon: React.ReactNode
  example: string
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "hold",
    label: "Hold to talk",
    description:
      "Press and hold the shortcut while you speak. Release to transcribe and stop.",
    icon: <Hand weight="regular" className="size-4" />,
    example: "Like a walkie-talkie — natural for short utterances.",
  },
  {
    id: "toggle",
    label: "Press to toggle",
    description:
      "Press once to start recording, press again to stop. Best for long dictation sessions.",
    icon: <ToggleLeft weight="regular" className="size-4" />,
    example: "Tap → record → tap → transcribe. Your hands stay on the keyboard.",
  },
]

export function StepKeybindings({ onNext, onBack }: StepKeybindingsProps) {
  const [combo, setCombo] = React.useState<KeyCombo>(DEFAULT_COMBO)
  const [mode, setMode] = React.useState<TriggerMode>(DEFAULT_MODE)
  const [listening, setListening] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [registering, setRegistering] = React.useState(false)

  const handleStartListening = () => {
    setListening(true)
    setSaved(false)
  }

  React.useEffect(() => {
    if (!listening) return

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()

      const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"])
      if (MODIFIER_KEYS.has(e.key)) return

      const mods: Modifier[] = []
      if (e.metaKey) mods.push("Super")
      if (e.ctrlKey) mods.push("Ctrl")
      if (e.altKey) mods.push("Alt")
      if (e.shiftKey) mods.push("Shift")

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key

      if (mods.length > 0) {
        setCombo({ modifiers: mods, key })
        setListening(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [listening])

  const handleSave = async () => {
    setRegistering(true)

    localStorage.setItem("whisply-shortcut", JSON.stringify(combo))
    localStorage.setItem("whisply-trigger-mode", mode)

    if (isTauri()) {
      const shortcutStr = comboToString(combo)
      try {
        await invoke("register_shortcut_evdev", {
          shortcutKey: shortcutStr,
          mode,
        })
      } catch (err) {
        console.warn("Failed to register shortcut:", err)
      }
    }

    setRegistering(false)
    setSaved(true)
    onNext()
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold tracking-tight">
          Push-to-talk shortcut
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Pick a key combination and choose how it should behave.
        </p>
      </div>

      {/* Group: key combination */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
            <Keyboard weight="regular" className="size-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold text-foreground">
            Key combination
          </h3>
        </div>
        <button
          type="button"
          onClick={handleStartListening}
          className={cn(
            "group flex items-center justify-between gap-4 rounded-lg border bg-card/40 px-4 py-4 text-left transition-all",
            listening
              ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
              : "border-border/60 hover:border-border hover:bg-card/60"
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-9 place-items-center rounded-md transition-colors",
                listening
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <CornersOut
                weight="regular"
                className={cn(
                  "size-4 transition-colors",
                  listening && "text-primary"
                )}
              />
            </span>
            <div>
              <p className="text-[13.5px] font-medium text-foreground">
                {listening ? "Listening for keys…" : "Click to record a shortcut"}
              </p>
              <p className="text-xs text-muted-foreground">
                {listening
                  ? "Press a modifier + a key together"
                  : "Pick something you won't hit by accident"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {combo.modifiers.map((m) => (
              <kbd
                key={m}
                className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-foreground shadow-xs"
              >
                {MODIFIER_LABELS[m] ?? m}
              </kbd>
            ))}
            <span className="text-xs text-muted-foreground">+</span>
            <kbd className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-foreground shadow-xs">
              {combo.key}
            </kbd>
          </div>
        </button>
      </div>

      {/* Group: trigger mode (list) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
            <ToggleLeft weight="regular" className="size-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold text-foreground">
            Trigger mode
          </h3>
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Choose how the shortcut should behave when you press it.
        </p>
        <ul
          role="radiogroup"
          aria-label="Trigger mode"
          className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40"
        >
          {MODE_OPTIONS.map((opt) => {
            const selected = opt.id === mode
            return (
              <li key={opt.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors",
                    "hover:bg-muted/40",
                    selected && "bg-primary/[0.04]"
                  )}
                >
                  <input
                    type="radio"
                    name="trigger-mode"
                    value={opt.id}
                    checked={selected}
                    onChange={() => setMode(opt.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      selected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-background"
                    )}
                  >
                    {selected ? (
                      <span className="size-1.5 rounded-full bg-primary-foreground" />
                    ) : null}
                  </span>
                  <div className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground/5 text-foreground">
                    {opt.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-medium text-foreground">
                        {opt.label}
                      </p>
                      {selected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                          <Check weight="bold" className="size-2.5" />
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {opt.description}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {opt.example}
                    </p>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSave} disabled={listening || registering}>
          {registering ? (
            "Registering…"
          ) : saved ? (
            <>
              <Check weight="bold" className="size-3.5" />
              Saved
            </>
          ) : (
            "Save & continue"
          )}
        </Button>
      </div>
    </div>
  )
}
