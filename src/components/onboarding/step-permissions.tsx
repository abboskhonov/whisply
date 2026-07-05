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

type PermissionState = "pending" | "granted" | "denied" | "unavailable"

type PermissionItem = {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  state: PermissionState
}

type StepPermissionsProps = {
  onNext: () => void
  onBack: () => void
}

async function checkMicrophoneAccess(): Promise<PermissionState> {
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
      id: "accessibility",
      label: "Accessibility",
      description: "Inject text into other applications",
      icon: <Keyboard weight="regular" className="size-4" />,
      state: "unavailable",
    },
    {
      id: "notifications",
      label: "Desktop notifications",
      description: "Show recording status and alerts",
      icon: <Globe weight="regular" className="size-4" />,
      state: "granted",
    },
  ])
  const [checking, setChecking] = React.useState(true)

  React.useEffect(() => {
    async function run() {
      setChecking(true)
      const micState = await checkMicrophoneAccess()
      setPermissions((prev) =>
        prev.map((p) =>
          p.id === "microphone" ? { ...p, state: micState } : p
        )
      )
      // Linux: accessibility permissions aren't needed for basic text
      // insertion via clipboard, so we skip for now
      setPermissions((prev) =>
        prev.map((p) =>
          p.id === "accessibility"
            ? { ...p, state: "unavailable", description: "Not required on Linux (clipboard-based)" }
            : p
        )
      )
      setChecking(false)
    }
    run()
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
                  : perm.state === "pending"
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
              {perm.state === "pending" && checking ? (
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
                    : "Checking…"}
            </span>
          </div>
        ))}
      </div>

      {permissions.find((p) => p.id === "microphone")?.state === "denied" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <WarningCircle
            weight="fill"
            className="mt-0.5 size-4 shrink-0 text-amber-500"
          />
          <p className="text-xs text-muted-foreground">
            Microphone access is blocked. You can grant it later in your
            system settings under Privacy & Security → Microphone.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!allRequiredGranted && !checking}>
          {allRequiredGranted ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  )
}
