import * as React from "react"
import {
  Keyboard,
  Check,
  Hand,
  ToggleLeft,
  Warning,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isTauri } from "@/lib/tauri"
import { invoke } from "@tauri-apps/api/core"
import { ShortcutRecorder } from "@/components/shortcut-recorder"
import {
  comboToShortcutString,
  DEFAULT_SHORTCUT,
  shortcutValidationError,
  type ShortcutConfig,
  type TriggerMode,
} from "@/lib/shortcuts"

const DEFAULT_MODE: TriggerMode = "hold"

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
    example:
      "Tap → record → tap → transcribe. Your hands stay on the keyboard.",
  },
]

export function StepKeybindings({ onNext, onBack }: StepKeybindingsProps) {
  const [combo, setCombo] = React.useState<ShortcutConfig>(DEFAULT_SHORTCUT)
  const [mode, setMode] = React.useState<TriggerMode>(DEFAULT_MODE)
  const [saved, setSaved] = React.useState(false)
  const [registering, setRegistering] = React.useState(false)
  const [registrationError, setRegistrationError] = React.useState<
    string | null
  >(null)

  const handleSave = async () => {
    setRegistering(true)
    setRegistrationError(null)

    try {
      const validationError = shortcutValidationError(combo)
      if (validationError) throw new Error(validationError)

      if (isTauri()) {
        const shortcutStr = comboToShortcutString(combo)
        await invoke("register_shortcut_evdev", {
          shortcutKey: shortcutStr,
          mode,
        })
      }

      localStorage.setItem("whisply-shortcut", JSON.stringify(combo))
      localStorage.setItem("whisply-trigger-mode", mode)
      setSaved(true)
      onNext()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Failed to register shortcut:", err)
      setRegistrationError(message)
    } finally {
      setRegistering(false)
    }
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
        <ShortcutRecorder
          value={combo}
          onChange={(next) => {
            setCombo(next)
            setSaved(false)
            setRegistrationError(null)
          }}
          disabled={registering}
        />
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-primary uppercase">
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

      {registrationError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          <Warning weight="fill" className="mt-0.5 size-3.5 shrink-0" />
          <span>{registrationError}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSave} disabled={registering}>
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
