import * as React from "react"
import {
  Check,
  Microphone,
  Keyboard,
  Bell,
  Warning,
  Terminal,
  ArrowsClockwise,
  CaretRight,
  Headphones,
  ShieldCheck,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { isTauri } from "@/lib/tauri"
import {
  getMicrophoneStatus,
  getInputStatus,
  getEvdevAccessStatus,
  fixEvdevPermissions,
  initializeInput,
  testInputConnection,
  type EvdevAccessStatus,
  type InputStatus,
} from "@/lib/system"
import {
  listMicrophones,
  startAudioCapture,
  stopAudioCapture,
  type DeviceInfo,
} from "@/lib/audio"

type PermissionStatus = "granted" | "denied" | "unavailable" | "checking"

type PermissionItem = {
  id: string
  label: string
  description: string
  status: PermissionStatus
  detail?: string
}

type PermissionGroup = {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  items: PermissionItem[]
}

type StepPermissionsProps = {
  onNext: () => void
  onBack: () => void
}

async function checkWebMicrophone(): Promise<PermissionStatus> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return "granted"
  } catch {
    return "denied"
  }
}

const INITIAL_GROUPS: PermissionGroup[] = [
  {
    id: "input",
    title: "Voice input",
    description: "Capture audio and detect when you speak.",
    icon: <Microphone weight="regular" className="size-4" />,
    items: [
      {
        id: "microphone",
        label: "Microphone",
        description: "Checking microphone access…",
        status: "checking",
      },
      {
        id: "device",
        label: "Default device",
        description: "Locating audio input device…",
        status: "checking",
      },
    ],
  },
  {
    id: "system",
    title: "System integration",
    description: "Read keyboard shortcuts and inject text into other apps.",
    icon: <Keyboard weight="regular" className="size-4" />,
    items: [
      {
        id: "global-shortcuts",
        label: "Global shortcuts",
        description: "Checking evdev access…",
        status: "checking",
      },
      {
        id: "text-insertion",
        label: "Text insertion",
        description: "Checking input system…",
        status: "checking",
      },
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    description: "Notify you while Whisply is listening or transcribing.",
    icon: <Bell weight="regular" className="size-4" />,
    items: [
      {
        id: "notifications",
        label: "Desktop notifications",
        description: "Checking notification permission…",
        status: "checking",
      },
    ],
  },
]

export function StepPermissions({ onNext, onBack }: StepPermissionsProps) {
  const [groups, setGroups] = React.useState<PermissionGroup[]>(INITIAL_GROUPS)
  const [busy, setBusy] = React.useState(true)
  const [actionInFlight, setActionInFlight] = React.useState<string | null>(null)
  const [, setDevices] = React.useState<DeviceInfo[]>([])

  const setItem = React.useCallback(
    (groupId: string, itemId: string, updates: Partial<PermissionItem>) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                items: g.items.map((i) =>
                  i.id === itemId ? { ...i, ...updates } : i
                ),
              }
            : g
        )
      )
    },
    []
  )

  const refreshMicrophone = React.useCallback(async () => {
    if (!isTauri()) {
      const status = await checkWebMicrophone()
      setItem("input", "microphone", {
        status,
        description:
          status === "granted"
            ? "Browser microphone access granted"
            : "Browser microphone access denied — click Grant to allow",
        detail: status === "denied" ? "Click Grant to allow access" : undefined,
      })
      return
    }
    try {
      const mic = await getMicrophoneStatus()
      const next: PermissionStatus = mic.available ? "granted" : "denied"
      setItem("input", "microphone", {
        status: next,
        description: mic.available
          ? `Found ${mic.device_count} device${mic.device_count === 1 ? "" : "s"}${mic.default_device ? ` · ${mic.default_device}` : ""}`
          : "No microphone devices detected",
        detail: mic.available ? undefined : "Plug in a microphone or check PipeWire/PulseAudio",
      })
    } catch {
      // Fall back to browser if cpal blows up.
      const status = await checkWebMicrophone()
      setItem("input", "microphone", {
        status,
        description: status === "granted" ? "Browser microphone access granted" : "Microphone unavailable",
      })
    }
  }, [setItem])

  const refreshInput = React.useCallback(async () => {
    if (!isTauri()) {
      setItem("system", "text-insertion", {
        status: "unavailable",
        description: "Text injection requires the native app",
      })
      return
    }
    try {
      const input: InputStatus = await getInputStatus()
      if (input.available) {
        await initializeInput().catch(() => null)
        const connected = await testInputConnection().catch(() => false)
        setItem("system", "text-insertion", {
          status: connected ? "granted" : "denied",
          description: connected
            ? `Ready · ${input.method}`
            : "Keyboard simulation failed",
          detail: input.wayland
            ? "On Wayland, text injection uses the clipboard fallback"
            : undefined,
        })
      } else {
        setItem("system", "text-insertion", {
          status: "unavailable",
          description: input.wayland
            ? "Using clipboard-based insertion (Wayland)"
            : "Keyboard simulation unavailable",
          detail: input.wayland
            ? "Install wtype or ydotool for direct injection"
            : undefined,
        })
      }
    } catch {
      setItem("system", "text-insertion", {
        status: "unavailable",
        description: "Text injection system unavailable",
      })
    }
  }, [setItem])

  const refreshEvdev = React.useCallback(async () => {
    if (!isTauri()) {
      setItem("system", "global-shortcuts", {
        status: "unavailable",
        description: "Global shortcuts require the native app",
      })
      return
    }
    try {
      const evdev: EvdevAccessStatus = await getEvdevAccessStatus()
      if (evdev.can_read_events) {
        setItem("system", "global-shortcuts", {
          status: "granted",
          description: "Global keyboard events accessible",
        })
      } else if (evdev.in_input_group) {
        setItem("system", "global-shortcuts", {
          status: "granted",
          description: "You're in the input group",
          detail: "Log out and back in if shortcuts don't work yet",
        })
      } else if (evdev.pkexec_available) {
        setItem("system", "global-shortcuts", {
          status: "denied",
          description: "Need access to /dev/input/event*",
          detail: "Click Add me to input group — you'll be prompted for your password",
        })
      } else {
        setItem("system", "global-shortcuts", {
          status: "denied",
          description: evdev.message,
          detail: "Run: sudo usermod -a -G input $USER",
        })
      }
    } catch {
      setItem("system", "global-shortcuts", {
        status: "unavailable",
        description: "Could not check evdev access",
      })
    }
  }, [setItem])

  const refreshNotifications = React.useCallback(async () => {
    if (typeof Notification === "undefined") {
      setItem("feedback", "notifications", {
        status: "unavailable",
        description: "Notifications API not available",
      })
      return
    }
    // Notification.permission starts as "default" — treat that as granted
    // because Whisply doesn't gate the experience on it. Asking happens
    // organically in the OS.
    const perm = Notification.permission
    setItem("feedback", "notifications", {
      status: perm === "denied" ? "denied" : "granted",
      description:
        perm === "granted"
          ? "Desktop notifications allowed"
          : perm === "denied"
            ? "Notifications are blocked at the OS level"
            : "Will request permission when first needed",
    })
  }, [setItem])

  // First-load: groups are seeded with checking skeletons, then filled in.
  React.useEffect(() => {
    let cancelled = false

    async function load() {
      await Promise.all([
        refreshMicrophone(),
        refreshInput(),
        refreshEvdev(),
        refreshNotifications(),
      ])

      if (cancelled) return

      if (isTauri()) {
        try {
          const devs = await listMicrophones()
          if (cancelled) return
          setDevices(devs)
          const defaultDev = devs.find((d) => d.is_default) ?? devs[0]
          setItem("input", "device", {
            status: defaultDev ? "granted" : "unavailable",
            description: defaultDev
              ? `${defaultDev.name}${defaultDev.is_default ? " (default)" : ""}`
              : "No input devices detected",
          })
        } catch {
          setItem("input", "device", {
            status: "unavailable",
            description: "Could not list devices",
          })
        }
      } else {
        setItem("input", "device", {
          status: "unavailable",
          description: "Device list requires the native app",
        })
      }

      setBusy(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [refreshMicrophone, refreshInput, refreshEvdev, refreshNotifications, setItem])

  // One-click grant handlers.
  const handleGrantMicrophone = async () => {
    setActionInFlight("microphone")
    setItem("input", "microphone", {
      status: "checking",
      description: "Requesting microphone access…",
    })
    try {
      if (isTauri()) {
        // Try to open the capture stream — this is what actually triggers
        // the OS-level permission prompt the first time around.
        const info = await startAudioCapture()
        await stopAudioCapture().catch(() => null)
        setItem("input", "microphone", {
          status: "granted",
          description: `Granted · ${info.device} · ${(info.sample_rate / 1000).toFixed(1)} kHz`,
        })
        // Refresh the device row with the now-canonical default.
        const devs = await listMicrophones().catch(() => [] as DeviceInfo[])
        setDevices(devs)
        const def = devs.find((d) => d.is_default) ?? devs[0]
        if (def) {
          setItem("input", "device", {
            status: "granted",
            description: `${def.name}${def.is_default ? " (default)" : ""}`,
          })
        }
      } else {
        const status = await checkWebMicrophone()
        setItem("input", "microphone", {
          status,
          description: status === "granted" ? "Browser microphone access granted" : "Permission still blocked — check your browser settings",
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setItem("input", "microphone", {
        status: "denied",
        description: "Permission denied",
        detail: msg,
      })
    } finally {
      setActionInFlight(null)
    }
  }

  const handleAddToInputGroup = async () => {
    setActionInFlight("global-shortcuts")
    setItem("system", "global-shortcuts", {
      status: "checking",
      description: "Running pkexec…",
    })
    try {
      const result = await fixEvdevPermissions()
      setItem("system", "global-shortcuts", {
        status: "granted",
        description: result,
        detail: "Log out and back in for changes to take effect",
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setItem("system", "global-shortcuts", {
        status: "denied",
        description: "Failed to add you to the input group",
        detail: msg,
      })
    } finally {
      setActionInFlight(null)
    }
  }

  const handleRequestNotifications = async () => {
    if (typeof Notification === "undefined") return
    setActionInFlight("notifications")
    try {
      const perm = await Notification.requestPermission()
      setItem("feedback", "notifications", {
        status: perm === "granted" ? "granted" : "denied",
        description:
          perm === "granted"
            ? "Desktop notifications allowed"
            : perm === "denied"
              ? "Notifications are blocked at the OS level"
              : "Permission dismissed",
      })
    } finally {
      setActionInFlight(null)
    }
  }

  const handleRetry = async () => {
    setBusy(true)
    await Promise.all([
      refreshMicrophone(),
      refreshInput(),
      refreshEvdev(),
      refreshNotifications(),
    ])
    setBusy(false)
  }

  const allRequiredGranted = groups
    .flatMap((g) => g.items)
    .filter((i) => i.status !== "unavailable")
    .every((i) => i.status === "granted")

  const anyDenied = groups
    .flatMap((g) => g.items)
    .some((i) => i.status === "denied")

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="space-y-2 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck weight="regular" className="size-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Permissions
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Whisply needs a few things to work. One-click to grant what you can —
          everything else will fall back gracefully.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <PermissionGroupSection key={group.id} group={group}>
            {group.items.map((item) => {
              const action = resolveItemAction(item.id, item.status, {
                onGrantMic: handleGrantMicrophone,
                onFixEvdev: handleAddToInputGroup,
                onGrantNotifications: handleRequestNotifications,
                inFlight: actionInFlight,
              })
              return (
                <PermissionListRow
                  key={item.id}
                  item={item}
                  trailing={action}
                />
              )
            })}
          </PermissionGroupSection>
        ))}
      </div>

      {anyDenied ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3">
          <Warning weight="fill" className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-foreground">
              Some permissions are still blocked
            </p>
            <p className="text-xs text-muted-foreground">
              You can keep going with the items above in red — Whisply will use a fallback where it can.
              Click{" "}
              <button
                type="button"
                onClick={handleRetry}
                disabled={busy}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
              >
                <ArrowsClockwise weight="bold" className="size-3" />
                Retry
              </button>{" "}
              to re-check after granting.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {busy ? (
            <span className="text-xs text-muted-foreground">Checking…</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {allRequiredGranted
                ? "All set"
                : anyDenied
                  ? "Some items still need attention"
                  : "Ready"}
            </span>
          )}
          <Button onClick={onNext} disabled={busy}>
            Continue
            <CaretRight weight="bold" className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PermissionGroupSection({
  group,
  children,
}: {
  group: PermissionGroup
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
          {group.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-foreground">
            {group.title}
          </h3>
        </div>
        <GroupStatus items={group.items} />
      </div>
      <p className="px-1 text-xs text-muted-foreground">{group.description}</p>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40">
        {children}
      </ul>
    </div>
  )
}

function GroupStatus({ items }: { items: PermissionItem[] }) {
  if (items.some((i) => i.status === "checking")) {
    return <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Checking…</span>
  }
  const denied = items.filter((i) => i.status === "denied").length
  const granted = items.filter((i) => i.status === "granted").length
  if (denied > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
        <Warning weight="fill" className="size-3" />
        {denied} need attention
      </span>
    )
  }
  if (granted === items.length) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
        <Check weight="bold" className="size-3" />
        All set
      </span>
    )
  }
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
      {granted}/{items.length}
    </span>
  )
}

function PermissionListRow({
  item,
  trailing,
}: {
  item: PermissionItem
  trailing?: React.ReactNode
}) {
  return (
    <li className="group/perm">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <StatusGlyph status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13.5px] font-medium text-foreground">
              {item.label}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.description}
          </p>
          {item.detail ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              {item.detail}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      </div>
    </li>
  )
}

function StatusGlyph({ status }: { status: PermissionStatus }) {
  if (status === "checking") {
    return (
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted">
        <span className="size-3.5 animate-pulse rounded-full bg-muted-foreground/30" />
      </div>
    )
  }
  if (status === "granted") {
    return (
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-success/10 text-success">
        <Check weight="bold" className="size-3.5" />
      </div>
    )
  }
  if (status === "denied") {
    return (
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
        <Warning weight="bold" className="size-3.5" />
      </div>
    )
  }
  return (
    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground/60">
      <Headphones weight="regular" className="size-3.5" />
    </div>
  )
}

type ActionMap = {
  onGrantMic: () => void
  onFixEvdev: () => void
  onGrantNotifications: () => void
  inFlight: string | null
}

function resolveItemAction(
  id: string,
  status: PermissionStatus,
  a: ActionMap
): React.ReactNode {
  if (status === "checking") {
    return (
      <span className="text-[11px] text-muted-foreground/60">Checking…</span>
    )
  }
  if (status === "unavailable") {
    return (
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
        N/A
      </span>
    )
  }
  if (status === "granted") {
    return (
      <span className="text-[11px] font-medium uppercase tracking-wider text-success">
        Granted
      </span>
    )
  }
  // denied → show the one-click grant
  if (id === "microphone") {
    return (
      <Button
        size="xs"
        variant="default"
        disabled={a.inFlight === "microphone"}
        onClick={a.onGrantMic}
      >
        <Microphone weight="bold" className="size-3" />
        Grant
      </Button>
    )
  }
  if (id === "global-shortcuts") {
    return (
      <Button
        size="xs"
        variant="default"
        disabled={a.inFlight === "global-shortcuts"}
        onClick={a.onFixEvdev}
      >
        <Terminal weight="bold" className="size-3" />
        Add me to input group
      </Button>
    )
  }
  if (id === "notifications") {
    return (
      <Button
        size="xs"
        variant="default"
        disabled={a.inFlight === "notifications"}
        onClick={a.onGrantNotifications}
      >
        <Bell weight="bold" className="size-3" />
        Allow
      </Button>
    )
  }
  if (id === "text-insertion") {
    return (
      <span className="text-[11px] text-muted-foreground/60">No action needed</span>
    )
  }
  if (id === "device") {
    return (
      <span className="text-[11px] text-muted-foreground/60">No action needed</span>
    )
  }
  return null
}
