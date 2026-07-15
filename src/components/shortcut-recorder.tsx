import * as React from "react"
import { CornersOut } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import {
  MODIFIER_LABELS,
  shortcutFromKeyboardEvent,
  shortcutKeyLabel,
  shortcutValidationError,
  type ShortcutConfig,
} from "@/lib/shortcuts"

type ShortcutKeycapsProps = {
  combo: ShortcutConfig
}

export function ShortcutKeycaps({ combo }: ShortcutKeycapsProps) {
  const keys = [
    ...combo.modifiers.map((modifier) => MODIFIER_LABELS[modifier]),
    shortcutKeyLabel(combo.key),
  ]

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      aria-label={keys.join(" plus ")}
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          {index > 0 ? (
            <span aria-hidden className="text-xs text-muted-foreground">
              +
            </span>
          ) : null}
          <kbd className="inline-flex h-7 min-w-8 items-center justify-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-foreground shadow-xs">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  )
}

type ShortcutRecorderProps = {
  value: ShortcutConfig
  onChange: (combo: ShortcutConfig) => void
  disabled?: boolean
}

export function ShortcutRecorder({
  value,
  onChange,
  disabled = false,
}: ShortcutRecorderProps) {
  const [listening, setListening] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!listening) return

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (
        event.key === "Escape" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        setListening(false)
        setError(null)
        return
      }

      const combo = shortcutFromKeyboardEvent(event)
      if (!combo) return

      const validationError = shortcutValidationError(combo)
      if (validationError) {
        setError(validationError)
        return
      }

      onChange(combo)
      setError(null)
      setListening(false)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [listening, onChange])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={listening}
        onClick={() => {
          setListening(true)
          setError(null)
        }}
        className={cn(
          "flex min-h-16 w-full items-center justify-between gap-4 rounded-lg border bg-card/40 px-4 py-3 text-left transition-all outline-none",
          "hover:border-border hover:bg-card/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
          listening &&
            "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground transition-colors",
              listening && "bg-primary/10 text-primary"
            )}
          >
            <CornersOut weight="regular" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-foreground">
              {listening ? "Listening for keys…" : "Dictation shortcut"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {listening
                ? "Press a combination or function key · Esc cancels"
                : "Click to record a different shortcut"}
            </span>
          </span>
        </span>
        <ShortcutKeycaps combo={value} />
      </button>
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
