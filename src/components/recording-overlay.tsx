import * as React from "react"
import { Waveform } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

type OverlayState = "idle" | "recording" | "transcribing"

type RecordingOverlayProps = {
  state: OverlayState
  shortcutKey?: string
}

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-primary transition-all",
            active ? "animate-pulse" : "h-1 bg-muted-foreground/20"
          )}
          style={
            active
              ? {
                  height: `${Math.max(4, Math.sin(i * 1.2 + Date.now() * 0.005) * 6 + 10)}px`,
                  animationDuration: `${0.4 + Math.random() * 0.3}s`,
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}

function AnimatedBars() {
  const [heights, setHeights] = React.useState([6, 10, 14, 10, 6])

  React.useEffect(() => {
    const interval = setInterval(() => {
      setHeights(
        [1, 2, 3, 4, 5].map(
          (i) => Math.max(4, Math.sin(i * 1.2 + Date.now() * 0.005) * 6 + 10)
        )
      )
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-[3px]">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-primary transition-all duration-75"
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  )
}

export function RecordingOverlay({ state, shortcutKey }: RecordingOverlayProps) {
  if (state === "idle") return null

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex items-center justify-center pointer-events-none",
        "animate-in slide-in-from-top-2 fade-in duration-200"
      )}
    >
      <div
        className={cn(
          "mt-2 flex items-center gap-3 rounded-full px-5 py-2.5 shadow-lg ring-1 backdrop-blur-sm transition-colors",
          state === "recording"
            ? "bg-background/95 ring-red-500/30 shadow-red-500/10"
            : "bg-background/95 ring-amber-500/30 shadow-amber-500/10"
        )}
      >
        {/* Icon */}
        <div className="relative grid size-7 place-items-center">
          {state === "recording" ? (
            <>
              <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />
              <div className="size-2.5 rounded-full bg-red-500" />
            </>
          ) : (
            <Waveform weight="fill" className="size-4 text-amber-500" />
          )}
        </div>

        {/* Audio bars */}
        {state === "recording" ? <AnimatedBars /> : <WaveformBars active={false} />}

        {/* Label */}
        <span className="text-xs font-medium text-foreground/80">
          {state === "recording" ? "Recording…" : "Transcribing…"}
        </span>

        {/* Shortcut hint */}
        {shortcutKey && (
          <kbd className="ml-1 hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            {shortcutKey}
          </kbd>
        )}
      </div>
    </div>
  )
}
