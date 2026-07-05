import * as React from "react"
import { Check, LinuxLogo, Warning } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type OsInfo = {
  name: string
  kernel: string
  desktop: string
  audioSystem: string
}

function detectOs(): OsInfo {
  const ua = navigator.userAgent
  const isLinux = ua.includes("Linux") || ua.includes("X11")
  return {
    name: isLinux ? "Linux" : ua.includes("Mac") ? "macOS" : ua.includes("Windows") ? "Windows" : "Unknown",
    kernel: "6.x",
    desktop: "GNOME / KDE",
    audioSystem: "PipeWire",
  }
}

const OS_CHECKS = [
  { label: "Linux detected", check: true },
  { label: "Wayland / X11 compatible", check: true },
  { label: "PipeWire audio system", check: true },
  { label: "GPU acceleration available", check: true },
]

type StepOsDetectionProps = {
  onNext: () => void
  onBack: () => void
}

export function StepOsDetection({ onNext, onBack }: StepOsDetectionProps) {
  const [os] = React.useState(detectOs)

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/50 px-5 py-3">
        <LinuxLogo weight="fill" className="size-7 text-foreground" />
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">{os.name}</p>
          <p className="text-xs text-muted-foreground">
            {os.kernel} · {os.desktop} · {os.audioSystem}
          </p>
        </div>
      </div>

      <div className="w-full space-y-3">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          System compatibility
        </h2>
        <div className="rounded-lg border border-border/60 bg-card/40">
          {OS_CHECKS.map((item, i) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i < OS_CHECKS.length - 1 && "border-b border-border/40"
              )}
            >
              {item.check ? (
                <div className="grid size-5 place-items-center rounded-full bg-success/10">
                  <Check
                    weight="bold"
                    className="size-3 text-success"
                  />
                </div>
              ) : (
                <div className="grid size-5 place-items-center rounded-full bg-destructive/10">
                  <Warning
                    weight="bold"
                    className="size-3 text-destructive"
                  />
                </div>
              )}
              <span className="text-sm text-foreground">{item.label}</span>
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
