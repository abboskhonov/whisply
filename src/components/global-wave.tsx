import { Check, Waveform, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import type { DictationState } from "@/hooks/use-dictation"

type GlobalWaveProps = {
  state: DictationState
  levels: number[]
  elapsed: number
  shortcutKey?: string
  onCancel?: () => void
  className?: string
}

const BARS = 16
const FALLBACK_BARS = new Array(BARS).fill(0).map((_, i) =>
  // Soft sine so the "no signal" resting state has a gentle shape, not a flat line.
  0.18 + 0.08 * Math.sin(i * 0.7)
)

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, "0")}`
}

/**
 * The push-to-talk pill that floats at the top of the app while the user
 * holds the keybinding. Three visual states:
 *   - recording:  pulsing dot + live waveform + timer
 *   - transcribing: spinner + "Transcribing…" + check on success
 *   - denied:    warning + retry hint
 *
 * Animations are CSS-only (mount/unmount via the parent). We use the
 * `data-state` attribute pattern so the same component swaps styles without
 * remounting.
 */
export function GlobalWave({
  state,
  levels,
  elapsed,
  shortcutKey,
  onCancel,
  className,
}: GlobalWaveProps) {
  const visible = state !== "idle"
  const displayLevels = state === "recording" && levels.length > 0 ? levels : FALLBACK_BARS

  return (
    <div
      data-state={state}
      data-visible={visible ? "true" : "false"}
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-2",
        "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0",
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex h-10 items-center gap-3 rounded-full border bg-background/95 pl-3 pr-2 shadow-lg ring-1 backdrop-blur-md",
          "transition-colors duration-300",
          state === "recording"
            ? "border-red-500/20 ring-red-500/20"
            : state === "transcribing"
              ? "border-amber-500/20 ring-amber-500/20"
              : state === "denied"
                ? "border-destructive/30 ring-destructive/20"
                : "border-border/60 ring-border/40"
        )}
      >
        <StateIcon state={state} />

        <WaveformBarGroup
          levels={displayLevels}
          active={state === "recording"}
          accent={
            state === "transcribing"
              ? "amber"
              : state === "denied"
                ? "destructive"
                : "red"
          }
        />

        <StateLabel state={state} elapsed={elapsed} shortcutKey={shortcutKey} />

        {onCancel && visible ? (
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "grid size-6 place-items-center rounded-full text-muted-foreground",
              "transition-all duration-200 ease-out",
              "hover:bg-muted hover:text-foreground active:scale-95"
            )}
            aria-label="Cancel"
          >
            <X weight="bold" className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function StateIcon({ state }: { state: DictationState }) {
  if (state === "recording") {
    return (
      <div className="relative grid size-5 shrink-0 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
        <span className="relative size-2.5 rounded-full bg-red-500" />
      </div>
    )
  }
  if (state === "transcribing") {
    return (
      <div className="relative grid size-5 shrink-0 place-items-center">
        <span className="size-4 animate-spin rounded-full border-[1.5px] border-amber-500/30 border-t-amber-500" />
      </div>
    )
  }
  if (state === "denied") {
    return (
      <div className="grid size-5 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
        <X weight="bold" className="size-3" />
      </div>
    )
  }
  return null
}

function StateLabel({
  state,
  elapsed,
  shortcutKey,
}: {
  state: DictationState
  elapsed: number
  shortcutKey?: string
}) {
  if (state === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tabular-nums text-foreground/80">
          {formatElapsed(elapsed)}
        </span>
        {shortcutKey ? (
          <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground sm:inline-block">
            {shortcutKey}
          </kbd>
        ) : null}
      </div>
    )
  }
  if (state === "transcribing") {
    return (
      <span className="text-xs font-medium text-foreground/80">
        Transcribing…
      </span>
    )
  }
  if (state === "denied") {
    return (
      <span className="text-xs font-medium text-destructive">
        Microphone blocked
      </span>
    )
  }
  return null
}

function WaveformBarGroup({
  levels,
  active,
  accent,
}: {
  levels: number[]
  active: boolean
  accent: "red" | "amber" | "destructive"
}) {
  // 16 bars, each 3px wide, 2px gap, capped 4–18 px tall.
  const colorClass =
    accent === "red"
      ? "bg-red-500"
      : accent === "amber"
        ? "bg-amber-500"
        : "bg-destructive"

  return (
    <div
      className="flex h-5 items-center gap-[2px]"
      role="presentation"
      aria-hidden
    >
      {Array.from({ length: BARS }).map((_, i) => {
        const raw = levels[i] ?? 0
        // Perceptual curve so quiet speech still moves the bars.
        const v = active ? Math.min(1, Math.pow(raw, 0.65)) : raw
        const h = active ? Math.max(2, v * 18) : Math.max(2, v * 18)
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-[height,background-color] duration-100 ease-out",
              active ? colorClass : "bg-muted-foreground/25"
            )}
            style={{ height: `${h}px` }}
          />
        )
      })}
    </div>
  )
}

/**
 * Re-export of the icon for callers that want to render the brand in a header.
 */
export function GlobalWaveBrand() {
  return (
    <span className="flex items-center gap-1.5">
      <Waveform weight="fill" className="size-4 text-red-500" />
      <Check weight="bold" className="size-3 text-success" />
    </span>
  )
}
