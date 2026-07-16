import * as React from "react"
import {
  Check,
  Hand,
  Info,
  Terminal,
  ToggleLeft,
  Warning,
} from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"

import { Button } from "@/components/ui/button"
import { ShortcutRecorder } from "@/components/shortcut-recorder"
import {
  PageHeader,
  PageShell,
  Section,
  SectionHeader,
} from "@/components/page"
import { isTauri } from "@/lib/tauri"
import { fixEvdevPermissions, getEvdevAccessStatus } from "@/lib/system"
import { cn } from "@/lib/utils"
import {
  comboToShortcutString,
  DEFAULT_SHORTCUT,
  shortcutValidationError,
  type ShortcutConfig,
  type TriggerMode,
} from "@/lib/shortcuts"

const MODES: Array<{
  id: TriggerMode
  label: string
  description: string
  icon: React.ReactNode
}> = [
  {
    id: "hold",
    label: "Hold to talk",
    description:
      "Record while the shortcut is held, then transcribe on release.",
    icon: <Hand weight="regular" className="size-4" />,
  },
  {
    id: "toggle",
    label: "Press to toggle",
    description: "Press once to start and again to stop recording.",
    icon: <ToggleLeft weight="regular" className="size-4" />,
  },
]

function readShortcut(): ShortcutConfig {
  try {
    const saved = localStorage.getItem("whisply-shortcut")
    if (!saved) return DEFAULT_SHORTCUT
    const parsed = JSON.parse(saved) as ShortcutConfig
    return shortcutValidationError(parsed) ? DEFAULT_SHORTCUT : parsed
  } catch {
    return DEFAULT_SHORTCUT
  }
}

export function ShortcutSettingsPage() {
  const [combo, setCombo] = React.useState<ShortcutConfig>(readShortcut)
  const [mode, setMode] = React.useState<TriggerMode>(() =>
    localStorage.getItem("whisply-trigger-mode") === "toggle"
      ? "toggle"
      : "hold"
  )
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [accessMessage, setAccessMessage] = React.useState<string | null>(null)
  const [hasShortcutAccess, setHasShortcutAccess] = React.useState<
    boolean | null
  >(null)
  const [fixingAccess, setFixingAccess] = React.useState(false)

  const checkShortcutAccess = React.useCallback(async () => {
    if (!isTauri()) {
      setHasShortcutAccess(null)
      setAccessMessage("Global shortcuts require the native app.")
      return
    }
    try {
      const access = await getEvdevAccessStatus()
      setHasShortcutAccess(access.can_read_events || access.in_input_group)
      setAccessMessage(access.message)
    } catch (cause) {
      setHasShortcutAccess(false)
      setAccessMessage(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void checkShortcutAccess(), 0)
    return () => window.clearTimeout(timer)
  }, [checkShortcutAccess])

  const fixShortcutAccess = async () => {
    setFixingAccess(true)
    try {
      setAccessMessage(await fixEvdevPermissions())
      setHasShortcutAccess(true)
    } catch (cause) {
      setHasShortcutAccess(false)
      setAccessMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setFixingAccess(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const validationError = shortcutValidationError(combo)
      if (validationError) throw new Error(validationError)

      const shortcutKey = comboToShortcutString(combo)
      if (isTauri()) {
        await invoke("register_shortcut_evdev", { shortcutKey, mode })
      }
      localStorage.setItem("whisply-shortcut", JSON.stringify(combo))
      localStorage.setItem("whisply-trigger-mode", mode)
      window.dispatchEvent(
        new CustomEvent("whisply-shortcut-changed", {
          detail: { shortcutKey, mode },
        })
      )
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Shortcut"
        description="Choose the keys that start and stop local dictation."
      />

      <Section>
        <SectionHeader
          title="Activation shortcut"
          description="Click the control, then press your preferred combination."
        />
        <ShortcutRecorder
          value={combo}
          onChange={(next) => {
            setCombo(next)
            setSaved(false)
            setError(null)
          }}
          disabled={saving}
        />
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          <Info weight="fill" className="mt-0.5 size-3.5 shrink-0" />
          <p>
            On Wayland, printable shortcuts can also reach the focused app.
            Ctrl + Space is the default: it is quick to hold and avoids typing
            into the focused app. A function key is another reliable option.
          </p>
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="Trigger behavior"
          description="Choose whether you hold the shortcut or toggle recording."
        />
        <ul
          role="radiogroup"
          aria-label="Trigger behavior"
          className="grid gap-2 sm:grid-cols-2"
        >
          {MODES.map((option) => {
            const selected = mode === option.id
            return (
              <li key={option.id}>
                <label
                  className={cn(
                    "flex h-full cursor-pointer items-start gap-3 rounded-lg border bg-card/40 p-3 transition-colors",
                    "hover:bg-muted/40",
                    selected && "border-primary/40 bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    name="trigger-mode"
                    value={option.id}
                    checked={selected}
                    onChange={() => {
                      setMode(option.id)
                      setSaved(false)
                    }}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
                      selected && "bg-primary/10 text-primary"
                    )}
                  >
                    {option.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section>
        <SectionHeader
          title="Global shortcut access"
          description="Linux needs permission to read global keyboard events."
        />
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-md",
              hasShortcutAccess
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            {hasShortcutAccess ? (
              <Check weight="bold" className="size-4" />
            ) : (
              <Terminal className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-foreground">
              {hasShortcutAccess
                ? "Global shortcuts ready"
                : "Global shortcut access"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {accessMessage ?? "Checking keyboard access…"}
            </p>
          </div>
          {!hasShortcutAccess && isTauri() ? (
            <Button
              size="sm"
              variant="outline"
              disabled={fixingAccess}
              onClick={() => void fixShortcutAccess()}
            >
              {fixingAccess ? "Updating…" : "Grant access"}
            </Button>
          ) : null}
        </div>
      </Section>

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive"
        >
          <Warning weight="fill" className="size-4" /> {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-4">
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check weight="bold" className="size-3.5 text-primary" />
            Shortcut saved
          </span>
        ) : null}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save shortcut"}
        </Button>
      </div>
    </PageShell>
  )
}
