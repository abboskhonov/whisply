import * as React from "react"
import { Check, ClipboardText, Warning } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  PageHeader,
  PageShell,
  Section,
  SectionHeader,
} from "@/components/page"
import {
  getInputStatus,
  initializeInput,
  testInputConnection,
  type InputStatus,
} from "@/lib/system"
import { isTauri } from "@/lib/tauri"

export function TextInsertionSettingsPage() {
  const [status, setStatus] = React.useState<InputStatus | null>(null)
  const [detail, setDetail] = React.useState("Checking text insertion…")
  const [checking, setChecking] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const check = React.useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      if (!isTauri()) {
        setStatus(null)
        setDetail("Text insertion requires the native app.")
        return
      }

      const next = await getInputStatus()
      setStatus(next)
      if (!next.available) {
        setDetail(
          next.wayland
            ? "Whisply will use clipboard-based insertion on Wayland."
            : "Keyboard simulation is unavailable on this system."
        )
        return
      }

      await initializeInput()
      const connected = await testInputConnection()
      setDetail(
        connected
          ? `Ready · ${next.method}`
          : "Keyboard simulation could not be verified."
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setDetail("Text insertion is unavailable.")
      setError(message)
    } finally {
      setChecking(false)
    }
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void check(), 0)
    return () => window.clearTimeout(timer)
  }, [check])

  const ready = status?.available && detail.startsWith("Ready")

  return (
    <PageShell>
      <PageHeader
        title="Text insertion"
        description="Check how completed dictation is inserted into the app you are using."
      />

      <Section>
        <SectionHeader
          title="Insertion service"
          description="Whisply types text where your cursor is, or uses the clipboard when needed."
        />
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <span
            className={
              ready
                ? "grid size-9 shrink-0 place-items-center rounded-md bg-success/10 text-success"
                : "grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
            }
          >
            {ready ? (
              <Check weight="bold" className="size-4" />
            ) : (
              <ClipboardText className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-foreground">
              {checking
                ? "Checking connection…"
                : ready
                  ? "Text insertion ready"
                  : "Text insertion status"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            {status?.wayland ? (
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Wayland support may use the clipboard fallback depending on your
                desktop environment.
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={() => void check()}
          >
            {checking ? "Checking…" : "Check again"}
          </Button>
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
    </PageShell>
  )
}
