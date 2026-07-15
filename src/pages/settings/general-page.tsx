import * as React from "react"
import {
  ArrowsClockwise,
  Bell,
  Check,
  Power,
  Warning,
  Waveform,
} from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart"

import { Button } from "@/components/ui/button"
import { PageShell, PageHeader, Section } from "@/components/page"
import { isTauri } from "@/lib/tauri"

export function GeneralSettingsPage() {
  const [notificationPermission, setNotificationPermission] = React.useState<
    NotificationPermission | "unavailable"
  >(() =>
    typeof Notification === "undefined"
      ? "unavailable"
      : Notification.permission
  )

  const [autostartEnabled, setAutostartEnabled] = React.useState<
    boolean | null
  >(null)
  const [autostartError, setAutostartError] = React.useState<string | null>(
    null
  )

  React.useEffect(() => {
    if (!isTauri()) return
    const timer = window.setTimeout(() => {
      void isAutostartEnabled()
        .then(setAutostartEnabled)
        .catch((cause) =>
          setAutostartError(
            cause instanceof Error ? cause.message : String(cause)
          )
        )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return
    setNotificationPermission(await Notification.requestPermission())
  }

  const toggleAutostart = async () => {
    if (autostartEnabled === null) return
    setAutostartError(null)
    try {
      if (autostartEnabled) await disableAutostart()
      else await enableAutostart()
      setAutostartEnabled(!autostartEnabled)
    } catch (cause) {
      setAutostartError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const handleRerunWizard = async () => {
    // `reset_onboarding` clears the persisted "complete" flag in Rust
    // and opens the small onboarding window. The wizard is no longer
    // a route in this webview.
    try {
      await invoke("reset_onboarding")
    } catch (err) {
      console.error("reset_onboarding failed:", err)
    }
  }

  return (
    <PageShell>
      <PageHeader title="General" description="App preferences and defaults." />

      <Section>
        <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Power weight="bold" className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Launch at login
            </p>
            <p className="text-xs text-muted-foreground">
              Start Whisply automatically when you sign in to your computer.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Launch Whisply at login"
            aria-checked={autostartEnabled ?? false}
            disabled={autostartEnabled === null || !isTauri()}
            onClick={() => void toggleAutostart()}
            className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-muted p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-primary"
            data-state={autostartEnabled ? "on" : "off"}
          >
            <span
              className="size-5 rounded-full bg-background shadow-xs transition-transform data-[state=on]:translate-x-4"
              data-state={autostartEnabled ? "on" : "off"}
            />
          </button>
        </div>
        {autostartError ? (
          <p
            role="alert"
            className="flex items-center gap-2 px-1 text-xs text-destructive"
          >
            <Warning weight="fill" className="size-3.5" /> {autostartError}
          </p>
        ) : null}
      </Section>

      <Section>
        <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Bell weight="fill" className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Desktop notifications
            </p>
            <p className="text-xs text-muted-foreground">
              {notificationPermission === "granted"
                ? "Whisply can show recording and transcription updates."
                : notificationPermission === "denied"
                  ? "Notifications are blocked by your system."
                  : notificationPermission === "unavailable"
                    ? "Notifications are not available in this environment."
                    : "Allow notifications for recording and transcription updates."}
            </p>
          </div>
          {notificationPermission === "granted" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check weight="bold" className="size-3.5" /> Allowed
            </span>
          ) : notificationPermission !== "unavailable" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void requestNotifications()}
            >
              Allow
            </Button>
          ) : null}
        </div>
      </Section>

      <Section>
        <div className="rounded-lg border border-border/60 bg-card/40">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Waveform weight="fill" className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Setup wizard
              </p>
              <p className="text-xs text-muted-foreground">
                Re-run the initial setup to reconfigure permissions, shortcuts,
                and system checks.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRerunWizard}>
              <ArrowsClockwise weight="bold" className="size-3.5" />
              Open wizard
            </Button>
          </div>
        </div>
      </Section>
    </PageShell>
  )
}
