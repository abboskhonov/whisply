import * as React from "react"
import { Microphone, Record, Stop, Sparkle, ArrowsClockwise } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isTauri } from "@/lib/tauri"
import { useDictation, type DictationState } from "@/hooks/use-dictation"

const BARS = 32
const FALLBACK = new Array(BARS).fill(0).map((_, i) =>
  0.16 + 0.06 * Math.sin(i * 0.5)
)

type DictationDemoProps = {
  className?: string
}

/**
 * The "try it out" panel. Lives on the home page and is what users see when
 * onboarding is complete. The push-to-talk button calls the same
 * `start`/`stop` actions that the global keybinding does — so pressing
 * the button or holding the shortcut produce identical state on screen.
 */
export function DictationDemo({ className }: DictationDemoProps) {
  const { state, levels, elapsed, error, shortcutKey, start, stop, cancel } =
    useDictation({
      onSamples: (samples) => {
        setSampleBuffer((prev) => {
          const next = prev.concat(samples)
          // Cap to ~3 seconds of demo history at 48 kHz
          return next.length > 48_000 * 3 ? next.slice(-48_000 * 2) : next
        })
      },
    })

  const [sampleBuffer, setSampleBuffer] = React.useState<number[]>([])
  const [mockTranscript, setMockTranscript] = React.useState<string[]>([])

  // When the demo transitions to "transcribing", append a fake transcript
  // line so the panel tells the user what to expect.
  React.useEffect(() => {
    if (state === "transcribing") {
      const timer = setTimeout(() => {
        const demoLines = [
          "This is what your dictated text will look like.",
          "I think it's amazing. I want to buy something.",
          "I am just testing it, and it seems to be really amazing.",
          "Let's start with shipping targets for next sprint.",
        ]
        const line = demoLines[Math.floor(Math.random() * demoLines.length)]
        setMockTranscript((prev) => [line, ...prev].slice(0, 5))
      }, 700)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [state])

  return (
    <div
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Sparkle weight="fill" className="size-4 text-primary" />
            Try Whisply
          </h2>
          <p className="text-xs text-muted-foreground">
            Hold the keybinding or press the button to capture audio.
          </p>
        </div>
        {shortcutKey ? (
          <kbd className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {shortcutKey}
          </kbd>
        ) : null}
      </div>

      {/* Live waveform + controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-background/60 p-4">
        <DemoWaveform
          levels={levels.length > 0 ? levels : FALLBACK}
          state={state}
          sampleBuffer={sampleBuffer}
        />
        <div className="flex items-center justify-between gap-3">
          <StateBadge state={state} elapsed={elapsed} />
          <div className="flex items-center gap-2">
            {state === "recording" ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void stop()}
                className="gap-1.5"
              >
                <Stop weight="fill" className="size-3.5" />
                Stop
              </Button>
            ) : state === "transcribing" ? (
              <Button size="sm" variant="outline" onClick={() => void cancel()}>
                <ArrowsClockwise weight="bold" className="size-3.5" />
                Cancel
              </Button>
            ) : (
              <PushToTalkButton
                onPressStart={() => void start()}
                onPressEnd={() => void stop()}
                disabled={state === "denied"}
              />
            )}
          </div>
        </div>
        {error ? (
          <p className="text-xs text-destructive">
            {error}
            {!isTauri() ? " (In dev mode, browser mic is used as a fallback.)" : null}
          </p>
        ) : null}
      </div>

      {/* Mock transcript list — the "what you'll get" preview */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            What you'll see
          </p>
          {mockTranscript.length > 0 ? (
            <button
              type="button"
              onClick={() => setMockTranscript([])}
              className="text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
        {mockTranscript.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center">
            <Microphone
              weight="regular"
              className="mx-auto mb-1.5 size-4 text-muted-foreground/60"
            />
            <p className="text-xs text-muted-foreground">
              Hold the keybinding to capture your first dictation.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40">
            {mockTranscript.map((line, i) => (
              <li
                key={`${line}-${i}`}
                className="flex items-start gap-3 px-3 py-2.5"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <p className="text-[13px] text-foreground/90">{line}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StateBadge({
  state,
  elapsed,
}: {
  state: DictationState
  elapsed: number
}) {
  if (state === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span className="relative grid size-2.5 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />
          <span className="relative size-1.5 rounded-full bg-red-500" />
        </span>
        <span className="text-xs font-medium text-foreground/80">Listening</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatElapsed(elapsed)}
        </span>
      </div>
    )
  }
  if (state === "transcribing") {
    return (
      <div className="flex items-center gap-2">
        <span className="size-2.5 animate-spin rounded-full border-[1.5px] border-amber-500/30 border-t-amber-500" />
        <span className="text-xs font-medium text-foreground/80">
          Transcribing…
        </span>
      </div>
    )
  }
  if (state === "denied") {
    return (
      <span className="text-xs font-medium text-destructive">
        Microphone blocked — grant access in step 2
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground">
      Press and hold to dictate
    </span>
  )
}

function PushToTalkButton({
  onPressStart,
  onPressEnd,
  disabled,
}: {
  onPressStart: () => void
  onPressEnd: () => void
  disabled?: boolean
}) {
  return (
    <Button
      size="sm"
      disabled={disabled}
      onMouseDown={onPressStart}
      onMouseUp={onPressEnd}
      onMouseLeave={onPressEnd}
      onTouchStart={onPressStart}
      onTouchEnd={onPressEnd}
      onTouchCancel={onPressEnd}
      className="gap-1.5"
    >
      <Record weight="fill" className="size-3.5" />
      Hold to talk
    </Button>
  )
}

function DemoWaveform({
  levels,
  state,
  sampleBuffer,
}: {
  levels: number[]
  state: DictationState
  sampleBuffer: number[]
}) {
  // Down-sample the rolling sample buffer into BARS buckets for a richer
  // "actual audio" visual, and overlay the smoothed levels. Falls back to
  // the synthetic level shape when there's no sample data yet.
  const buckets = React.useMemo(() => {
    if (sampleBuffer.length > BARS * 8) {
      const chunk = Math.floor(sampleBuffer.length / BARS)
      const out: number[] = new Array(BARS)
      for (let i = 0; i < BARS; i++) {
        const start = i * chunk
        const end = start + chunk
        let sum = 0
        for (let j = start; j < end; j++) {
          const v = sampleBuffer[j]
          sum += v * v
        }
        out[i] = Math.sqrt(sum / chunk)
      }
      // Normalize to [0, 1] and apply perceptual curve.
      let max = 0
      for (const v of out) if (v > max) max = v
      const scale = max > 0 ? 1 / max : 1
      return out.map((v) => Math.min(1, Math.pow(v * scale * 0.6, 0.6)))
    }
    return null
  }, [sampleBuffer])

  const isActive = state === "recording"
  const displayBuckets = buckets ?? levels

  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md bg-muted/30">
      <div
        className={cn(
          "flex h-full items-center justify-center gap-[2px] px-2 transition-opacity duration-300",
          isActive ? "opacity-100" : "opacity-50"
        )}
      >
        {Array.from({ length: BARS }).map((_, i) => {
          const v = Math.max(0, Math.min(1, displayBuckets[i] ?? 0))
          const h = Math.max(2, v * 60)
          const mirroredH = Math.max(2, h / 2)
          return (
            <span
              key={i}
              className={cn(
                "flex w-[3px] flex-col items-center justify-center gap-px",
                isActive ? "opacity-100" : "opacity-70"
              )}
            >
              <span
                className={cn(
                  "w-full rounded-full transition-[height] duration-75",
                  isActive ? "bg-primary" : "bg-muted-foreground/30"
                )}
                style={{ height: `${mirroredH}px` }}
              />
              <span
                className={cn(
                  "w-full rounded-full transition-[height] duration-75",
                  isActive ? "bg-primary/60" : "bg-muted-foreground/20"
                )}
                style={{ height: `${mirroredH}px` }}
              />
            </span>
          )
        })}
      </div>
      {state === "transcribing" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs text-foreground/80">
            <span className="size-3 animate-spin rounded-full border-[1.5px] border-amber-500/30 border-t-amber-500" />
            <span>Processing…</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
