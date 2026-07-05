import * as React from "react"
import {
  Check,
  Microphone,
  Keyboard,
  Globe,
  WarningCircle,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isTauri } from "@/lib/tauri"
import {
  getMicrophoneStatus,
  getInputStatus,
  initializeInput,
  testInputConnection,
} from "@/lib/system"

type PermissionState = "pending" | "checking" | "granted" | "denied" | "unavailable"

type PermissionItem = {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  state: PermissionState
  detail?: string
}

type StepPermissionsProps = {
  onNext: () => void
  onBack: () => void
}

async function checkWebMicrophone(): Promise<PermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return "granted"
  } catch {
    return "denied"
  }
}

export function StepPermissions({ onNext, onBack }: StepPermissionsProps) {
  const [permissions, setPermissions] = React.useState<PermissionItem[]>([
    {
      id: "microphone",
      label: "Microphone",
      description: "Access your microphone for voice capture",
      icon: <Microphone weight="regular" className="size-4" />,
      state: "pending",
    },
    {
      id: "text-insertion",
      label: "Text insertion",
      description: "Inject transcribed text into other applications",
      icon: <Keyboard weight="regular" className="size-4" />,
      state: "pending",
    },
    {
      id: "notifications",
      label: "Desktop notifications",
      description: "Show recording status and alerts",
      icon: <Globe weight="regular" className="size-4" />,
      state: "granted",
    },
  ])
  const [busy, setBusy] = React.useState(true)

  const updatePermission = (id: string, updates: Partial<PermissionItem>) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    )
  }

  React.useEffect(() => {
    async function checkAll() {
      setBusy(true)

      if (isTauri()) {
        // — Microphone via cpal —
        updatePermission("microphone", { state: "checking" })
        try {
          const mic = await getMicrophoneStatus()
          updatePermission("microphone", {
            state: mic.available ? "granted" : "denied",
            description: mic.available
              ? `Found ${mic.device_count} device(s)${mic.default_device ? ` (${mic.default_device})` : ""}`
              : "No microphone devices detected",
          })
        } catch {
          // Fall back to browser MediaDevices if cpal fails
          const webMic = await checkWebMicrophone()
          updatePermission("microphone", {
            state: webMic,
            description: webMic === "granted" ? "Browser mic access granted" : "Browser mic access denied",
          })
        }

        // — Text insertion via enigo —
        updatePermission("text-insertion", { state: "checking" })
        try {
          const input = await getInputStatus()
          if (input.available) {
            await initializeInput()
            const connected = await testInputConnection()
            updatePermission("text-insertion", {
              state: connected ? "granted" : "denied",
              description: connected
                ? `Keyboard simulation ready (${input.method})`
                : "Keyboard simulation test failed",
              detail: input.wayland ? "On Wayland, text insertion may use clipboard fallback" : undefined,
            })
          } else {
            updatePermission("text-insertion", {
              state: "unavailable",
              description: input.wayland
                ? "Wayland: clipboard-based insertion will be used"
                : "Keyboard simulation unavailable, using clipboard",
              detail: input.wayland ? "Install wtype/ydotool for direct input" : undefined,
            })
          }
        } catch {
          updatePermission("text-insertion", {
            state: "unavailable",
            description: "Input system check failed, using clipboard fallback",
          })
        }
      } else {
        // Web mode — use browser APIs
        updatePermission("microphone", { state: "checking" })
        const webMic = await checkWebMicrophone()
        updatePermission("microphone", {
          state: webMic,
          description:
            webMic === "granted"
              ? "Browser mic access granted"
              : "Browser mic access denied (HTTPS required)",
        })

        updatePermission("text-insertion", {
          state: "unavailable",
          description: "Text insertion requires native app (Tauri)",
        })
      }

      setBusy(false)
    }

    checkAll()
  }, [])

  const allRequiredGranted = permissions
    .filter((p) => p.state !== "unavailable")
    .every((p) => p.state === "granted")

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8">
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold tracking-tight">
          Permissions
        </h2>
        <p className="text-sm text-muted-foreground">
          Whisply needs a few permissions to work properly.
        </p>
      </div>

      <div className="w-full space-y-2">
        {permissions.map((perm) => (
          <div
            key={perm.id}
            className={cn(
              "flex items-center gap-4 rounded-lg border px-4 py-3.5 transition-colors",
              perm.state === "granted"
                ? "border-success/20 bg-success/5"
                : perm.state === "denied"
                  ? "border-destructive/20 bg-destructive/5"
                  : perm.state === "checking" || perm.state === "pending"
                    ? "border-border/60 bg-muted/30"
                    : "border-border/30 bg-muted/20 opacity-60"
            )}
          >
            <div
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md",
                perm.state === "granted"
                  ? "bg-success/10 text-success"
                  : perm.state === "denied"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {perm.state === "checking" ? (
                <span className="size-4 animate-pulse rounded-full bg-muted-foreground/30" />
              ) : perm.state === "granted" ? (
                <Check weight="bold" className="size-4" />
              ) : (
                perm.icon
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {perm.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {perm.description}
              </p>
              {perm.detail && (
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                  {perm.detail}
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium",
                perm.state === "granted"
                  ? "text-success"
                  : perm.state === "denied"
                    ? "text-destructive"
                    : perm.state === "unavailable"
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground"
              )}
            >
              {perm.state === "granted"
                ? "Granted"
                : perm.state === "denied"
                  ? "Denied"
                  : perm.state === "unavailable"
                    ? "N/A"
                    : perm.state === "checking"
                      ? "Checking…"
                      : "Pending"}
            </span>
          </div>
        ))}
      </div>

      {permissions.find((p) => p.id === "microphone")?.state === "denied" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="text-xs text-muted-foreground">
            Microphone access is blocked. On Linux, check your system settings
            under Privacy & Security or ensure PulseAudio/PipeWire is running.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={busy}>
          {busy
            ? "Checking…"
            : allRequiredGranted
              ? "Continue"
              : "Skip for now"}
        </Button>
      </div>
    </div>
  )
}
