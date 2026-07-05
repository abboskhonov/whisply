import * as React from "react"
import { Keyboard, Check } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Modifier = "Super" | "Ctrl" | "Alt" | "Shift"

type KeyCombo = {
  modifiers: Modifier[]
  key: string
}

const DEFAULT_COMBO: KeyCombo = {
  modifiers: ["Super"],
  key: "V",
}

const MODIFIER_LABELS: Record<string, string> = {
  Super: "⊞ Win",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
}

type StepKeybindingsProps = {
  onNext: () => void
  onBack: () => void
}

export function StepKeybindings({ onNext, onBack }: StepKeybindingsProps) {
  const [combo, setCombo] = React.useState<KeyCombo>(DEFAULT_COMBO)
  const [listening, setListening] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const handleStartListening = () => {
    setListening(true)
    setSaved(false)
  }

  React.useEffect(() => {
    if (!listening) return

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()

      // Ignore modifier-only keydowns (e.g. pressing Ctrl alone fires
      // a keydown with key="Control" before the actual letter arrives).
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

  const handleSave = () => {
    setSaved(true)
    onNext()
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8">
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold tracking-tight">
          Push-to-talk shortcut
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose a keyboard shortcut to start and stop recording. Hold it while
          speaking, release to transcribe.
        </p>
      </div>

      {/* Key recorder */}
      <div
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 px-10 py-8 transition-all",
          listening
            ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
            : "border-border/60 bg-card/40 hover:border-border hover:bg-card/60"
        )}
        onClick={handleStartListening}
      >
        <Keyboard
          weight="regular"
          className={cn(
            "size-6 transition-colors",
            listening ? "text-primary" : "text-muted-foreground"
          )}
        />
        {listening ? (
          <span className="text-sm font-medium text-primary animate-pulse">
            Press your shortcut…
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
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
        )}
        <p className="text-xs text-muted-foreground">
          {listening ? "Esc to cancel" : "Click to change"}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSave} disabled={listening}>
          {saved ? (
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
