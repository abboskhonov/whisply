import * as React from "react"
import { Check, LinuxLogo, Warning } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isTauri } from "@/lib/tauri"
import { getSystemInfo, type SystemInfo } from "@/lib/system"

type OsCompatibilityCheck = {
  label: string
  check: boolean
  detail?: string
}

type StepOsDetectionProps = {
  onNext: () => void
  onBack: () => void
}

const FALLBACK_INFO: SystemInfo = {
  os: "Linux",
  kernel: "6.x",
  desktop: "GNOME / KDE",
  session_type: "wayland",
  audio_system: "PipeWire",
}

export function StepOsDetection({ onNext, onBack }: StepOsDetectionProps) {
  const [os, setOs] = React.useState<SystemInfo | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function detect() {
      if (isTauri()) {
        try {
          const info = await getSystemInfo()
          setOs(info)
        } catch {
          setOs(FALLBACK_INFO)
        }
      } else {
        // Web fallback — detect from user agent
        const ua = navigator.userAgent
        const isLinux = ua.includes("Linux") || ua.includes("X11")
        setOs({
          os: isLinux
            ? "Linux (web)"
            : ua.includes("Mac")
              ? "macOS"
              : ua.includes("Windows")
                ? "Windows"
                : "Unknown",
          kernel: "N/A (browser)",
          desktop: "N/A",
          session_type: "N/A",
          audio_system: "Browser MediaDevices",
        })
      }
      setLoading(false)
    }
    detect()
  }, [])

  const checks: OsCompatibilityCheck[] = React.useMemo(() => {
    if (!os) return []
    const isLinux = os.os.toLowerCase().includes("linux")
    const hasAudio = os.audio_system !== "Unknown"
    const hasDesktop = os.desktop !== "Unknown" && os.desktop !== "N/A"

    return [
      {
        label: `Detected OS: ${os.os}`,
        check: isLinux,
        detail: os.kernel,
      },
      {
        label: "Desktop environment",
        check: hasDesktop,
        detail: os.desktop,
      },
      {
        label: "Audio system",
        check: hasAudio,
        detail: os.audio_system,
      },
      {
        label: "Session type",
        check: true,
        detail: os.session_type === "wayland"
          ? "Wayland (text insertion via clipboard)"
          : os.session_type,
      },
    ]
  }, [os])

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-8">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/50 px-5 py-3">
          <LinuxLogo weight="fill" className="size-7 text-foreground animate-pulse" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Detecting system…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/50 px-5 py-3">
        <LinuxLogo weight="fill" className="size-7 text-foreground" />
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">{os?.os}</p>
          <p className="text-xs text-muted-foreground">
            {os?.kernel} · {os?.desktop} · {os?.audio_system}
          </p>
        </div>
      </div>

      <div className="w-full space-y-3">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          System compatibility
        </h2>
        <div className="rounded-lg border border-border/60 bg-card/40">
          {checks.map((item, i) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i < checks.length - 1 && "border-b border-border/40"
              )}
            >
              {item.check ? (
                <div className="grid size-5 place-items-center rounded-full bg-success/10">
                  <Check weight="bold" className="size-3 text-success" />
                </div>
              ) : (
                <div className="grid size-5 place-items-center rounded-full bg-destructive/10">
                  <Warning weight="bold" className="size-3 text-destructive" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-sm text-foreground">{item.label}</span>
                {item.detail && (
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  )
}
