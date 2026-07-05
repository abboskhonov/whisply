import * as React from "react"
import {
  Microphone,
  Record,
  Trash,
  Funnel,
  ArrowClockwise,
  Key,
  Lightning,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, Section } from "@/components/page"
import { isTauri, trackedInvoke } from "@/lib/tauri"
import { listen } from "@tauri-apps/api/event"

type LogLevel = "info" | "ok" | "warn" | "err" | "data"

type LogEntry = {
  id: number
  ts: number
  level: LogLevel
  source: string
  message: string
  detail?: string
}

const FILTER_LEVELS: Array<{ id: "all" | LogLevel; label: string }> = [
  { id: "all", label: "All" },
  { id: "ok", label: "OK" },
  { id: "info", label: "Info" },
  { id: "data", label: "Data" },
  { id: "warn", label: "Warn" },
  { id: "err", label: "Error" },
]

const LEVEL_DOT: Record<LogLevel, string> = {
  info: "bg-muted-foreground/40",
  ok: "bg-success",
  data: "bg-primary/50",
  warn: "bg-amber-500",
  err: "bg-destructive",
}

const MAX_ENTRIES = 500

export function LogsPage() {
  const [entries, setEntries] = React.useState<LogEntry[]>([])
  const [filter, setFilter] = React.useState<"all" | LogLevel>("all")
  const [paused, setPaused] = React.useState(false)
  const [shortcutKey, setShortcutKey] = React.useState<string>("")
  const [micActive, setMicActive] = React.useState(false)
  const [latestLevels, setLatestLevels] = React.useState<number[]>(
    new Array(16).fill(0)
  )
  const idRef = React.useRef(0)
  const bufferRef = React.useRef<LogEntry[]>([])
  const pausedRef = React.useRef(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Flush the buffer to state on a timer so high-frequency data events
  // don't trigger 30+ renders per second.
  React.useEffect(() => {
    const flush = setInterval(() => {
      if (bufferRef.current.length === 0) return
      const drained = bufferRef.current.splice(0)
      setEntries((prev) => {
        const next = prev.concat(drained)
        return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
      })
    }, 120)
    return () => clearInterval(flush)
  }, [])

  const push = React.useCallback(
    (level: LogLevel, source: string, message: string, detail?: string) => {
      const entry: LogEntry = {
        id: ++idRef.current,
        ts: Date.now(),
        level,
        source,
        message,
        detail,
      }
      if (pausedRef.current) return
      bufferRef.current.push(entry)
    },
    []
  )

  // Read the persisted shortcut on mount.
  React.useEffect(() => {
    const saved = localStorage.getItem("whisply-shortcut")
    if (saved) {
      try {
        const combo = JSON.parse(saved) as { modifiers: string[]; key: string }
        const modMap: Record<string, string> = {
          Super: "Super",
          Ctrl: "Ctrl",
          Alt: "Alt",
          Shift: "Shift",
        }
        const key = [...combo.modifiers.map((m) => modMap[m] ?? m), combo.key].join("+")
        setShortcutKey(key)
        push("ok", "boot", `Persisted shortcut loaded: ${key}`)
      } catch {
        push("warn", "boot", "Persisted shortcut is corrupt; ignoring")
      }
    } else {
      push("info", "boot", "No persisted shortcut found")
    }
    push(
      "info",
      "boot",
      isTauri() ? "Running inside Tauri" : "Running in browser (vite dev)"
    )
    if (isTauri()) {
      void trackedInvoke<boolean>("is_capturing")
        .then((c) => {
          setMicActive(c)
          push("info", "boot", `Mic currently capturing: ${c}`)
        })
        .catch((e) => push("err", "boot", `is_capturing failed: ${e}`))
    }
  }, [push])

  // Subscribe to every event we care about.
  React.useEffect(() => {
    if (!isTauri()) return
    const unsubs: Array<() => void> = []

    ;(async () => {
      const u1 = await listen<{ key: string; state: string }>(
        "whisply://shortcut",
        (e) => {
          const { key, state } = e.payload
          push(
            state === "pressed" ? "ok" : "info",
            "shortcut",
            `${key} ${state}`,
            state === "pressed"
              ? "→ start_audio_capture + overlay::show"
              : "→ stop_audio_capture + overlay hide (1.4s)"
          )
        }
      )
      unsubs.push(u1)

      const u2 = await listen<{
        state: string
        device?: string
        shortcut?: string
        error?: string
      }>("whisply://audio-state", (e) => {
        const { state, device, shortcut, error } = e.payload
        setMicActive(state === "recording")
        if (shortcut) setShortcutKey(shortcut)
        if (state === "denied" && error) {
          push("err", "audio", `denied: ${error}`)
        } else {
          push(
            state === "recording" ? "ok" : state === "idle" ? "info" : "data",
            "audio",
            `state → ${state}${device ? ` (${device})` : ""}${shortcut ? ` [${shortcut}]` : ""}`
          )
        }
      })
      unsubs.push(u2)

      const u3 = await listen<{ levels: number[] }>(
        "whisply://mic-level",
        (e) => {
          setLatestLevels(e.payload.levels)
        }
      )
      unsubs.push(u3)

      const u4 = await listen<{ kind: string; message: string }>(
        "whisply://audio-error",
        (e) => {
          push("err", "audio", `${e.payload.kind}: ${e.payload.message}`)
        }
      )
      unsubs.push(u4)

      const u5 = await listen("whisply://audio-started", () => {
        push("ok", "audio", "cpal stream started")
      })
      unsubs.push(u5)

      const u6 = await listen("whisply://audio-stopped", (e) => {
        const reason = (e.payload as { reason?: string } | undefined)?.reason
        push("info", "audio", `cpal stream stopped (${reason ?? "?"})`)
      })
      unsubs.push(u6)

      const u7 = await listen("whisply://overlay-cancel", () => {
        push("warn", "overlay", "cancel button pressed")
      })
      unsubs.push(u7)

      const u8 = await listen<{ shortcut: string }>(
        "whisply://shortcut-registered",
        (e) => {
          push("ok", "shortcut", `registered: ${e.payload.shortcut}`)
        }
      )
      unsubs.push(u8)
    })()

    return () => {
      unsubs.forEach((u) => u())
    }
  }, [push])

  // Auto-scroll to the bottom unless the user has scrolled up.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || paused) return
    const isAtBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (isAtBottom) el.scrollTop = el.scrollHeight
  }, [entries, paused])

  const handleTestCapture = async () => {
    if (!isTauri()) {
      push("err", "test", "Test capture requires the Tauri runtime")
      return
    }
    try {
      push("info", "test", "start_audio_capture()…")
      const info = await trackedInvoke<{
        device: string
        sample_rate: number
        channels: number
      }>("start_audio_capture", { deviceName: null })
      push(
        "ok",
        "test",
        `capture open: ${info.device} @ ${info.sample_rate}Hz ×${info.channels}`
      )
    } catch (err) {
      push("err", "test", String(err))
    }
  }

  const handleStopCapture = async () => {
    if (!isTauri()) return
    try {
      push("info", "test", "stop_audio_capture()…")
      const r = await trackedInvoke<{ reason: string }>("stop_audio_capture")
      push("ok", "test", `capture closed (${r.reason})`)
    } catch (err) {
      push("err", "test", String(err))
    }
  }

  const handleClear = () => {
    setEntries([])
    bufferRef.current = []
    push("info", "ui", "logs cleared")
  }

  const handleSimulateKey = async () => {
    if (!isTauri()) {
      push("err", "test", "Cannot simulate keypress in the browser")
      return
    }
    // The rdev listener runs in the Rust process and listens to /dev/input.
    // The frontend can't directly trigger it. But we can call the same
    // commands the shortcut handler calls, to validate the rest of the
    // pipeline (audio + overlay) without needing the global key listener.
    push("info", "test", "simulating press… (calls audio + overlay directly)")
    try {
      await trackedInvoke("start_audio_capture", { deviceName: null })
      push("ok", "test", "capture open")
    } catch (err) {
      push("err", "test", String(err))
    }
    setTimeout(async () => {
      try {
        await trackedInvoke("stop_audio_capture")
        push("ok", "test", "capture closed (simulated release)")
      } catch (err) {
        push("err", "test", String(err))
      }
    }, 2500)
  }

  const filtered = React.useMemo(() => {
    if (filter === "all") return entries
    return entries.filter((e) => e.level === filter)
  }, [entries, filter])

  return (
    <PageShell>
      <PageHeader
        title="Logs"
        description="Real-time event stream from the shortcut, audio, and overlay pipeline. Use this to debug why the keybinding isn't firing."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((p) => !p)}
              className="gap-1.5"
            >
              <ArrowClockwise weight="bold" className="size-3.5" />
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="gap-1.5"
            >
              <Trash weight="bold" className="size-3.5" />
              Clear
            </Button>
          </div>
        }
      />

      <Section>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusTile
            label="Registered shortcut"
            value={shortcutKey || "—"}
            tone={shortcutKey ? "default" : "muted"}
            icon={<Key weight="regular" className="size-4" />}
          />
          <StatusTile
            label="Mic"
            value={micActive ? "Capturing" : "Idle"}
            tone={micActive ? "success" : "muted"}
            icon={<Microphone weight="regular" className="size-4" />}
          />
          <StatusTile
            label="Last levels (peak)"
            value={peakLevel(latestLevels).toFixed(2)}
            tone={micActive ? "default" : "muted"}
            icon={<Lightning weight="regular" className="size-4" />}
          />
        </div>
      </Section>

      <Section>
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Funnel weight="bold" className="size-3.5" />
              <span>Filter:</span>
            </div>
            {FILTER_LEVELS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={
                  "rounded-md border px-2 py-1 text-xs font-medium transition-colors " +
                  (filter === f.id
                    ? "border-foreground/20 bg-foreground/5 text-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/40")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Actions:</span>
            {micActive ? (
              <Button
                size="xs"
                variant="destructive"
                onClick={handleStopCapture}
                className="gap-1.5"
              >
                <Record weight="fill" className="size-3" />
                Stop mic
              </Button>
            ) : (
              <Button
                size="xs"
                onClick={handleTestCapture}
                className="gap-1.5"
              >
                <Microphone weight="bold" className="size-3" />
                Start mic
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              onClick={handleSimulateKey}
              className="gap-1.5"
            >
              <Record weight="bold" className="size-3" />
              Simulate keypress
            </Button>
          </div>
        </div>
      </Section>

      <Section>
        <div
          ref={scrollRef}
          className="h-[60vh] overflow-y-auto rounded-lg border border-border/60 bg-card/30 font-mono text-[11.5px]"
        >
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-xs text-muted-foreground/60">
              {entries.length === 0
                ? "No events yet. Press your keybinding or click Simulate keypress to generate one."
                : "No events match the current filter."}
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-2 px-3 py-1.5"
                >
                  <span
                    className={
                      "mt-1.5 size-1.5 shrink-0 rounded-full " + LEVEL_DOT[e.level]
                    }
                    aria-hidden
                  />
                  <span className="shrink-0 text-muted-foreground/60">
                    {formatTime(e.ts)}
                  </span>
                  <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {e.source}
                  </span>
                  <span className="min-w-0 flex-1 text-foreground/90">
                    {e.message}
                  </span>
                  {e.detail ? (
                    <span className="shrink-0 text-muted-foreground/60">
                      {e.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </PageShell>
  )
}

function StatusTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: "default" | "success" | "muted"
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <div
        className={
          "grid size-8 place-items-center rounded-md " +
          (tone === "success"
            ? "bg-success/10 text-success"
            : tone === "muted"
              ? "bg-muted text-muted-foreground"
              : "bg-foreground/5 text-foreground")
        }
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {label}
        </p>
        <p className="truncate font-mono text-[13px] font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0")
}

function peakLevel(levels: number[]): number {
  let p = 0
  for (const l of levels) if (l > p) p = l
  return p
}
