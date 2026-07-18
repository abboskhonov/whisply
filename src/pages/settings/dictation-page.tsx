import * as React from "react"
import { Check, Microphone, Warning } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PageHeader,
  PageShell,
  Section,
  SectionHeader,
} from "@/components/page"
import {
  getSelectedMicrophone,
  listMicrophones,
  setSelectedMicrophone,
  startAudioCapture,
  stopAudioCapture,
  type DeviceInfo,
} from "@/lib/audio"
import { getMicrophoneStatus, type MicrophoneStatus } from "@/lib/system"
import { isTauri } from "@/lib/tauri"

export function DictationSettingsPage() {
  const [microphone, setMicrophone] = React.useState<MicrophoneStatus | null>(
    null
  )
  const [devices, setDevices] = React.useState<DeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = React.useState<string | null>(
    null
  )
  const [detail, setDetail] = React.useState("Checking microphone access…")
  const [checking, setChecking] = React.useState(true)
  const [savingDevice, setSavingDevice] = React.useState(false)

  const checkMicrophone = React.useCallback(async () => {
    setChecking(true)
    try {
      if (isTauri()) {
        const [status, availableDevices, configuredDevice] = await Promise.all([
          getMicrophoneStatus(),
          listMicrophones(),
          getSelectedMicrophone(),
        ])
        setMicrophone(status)
        setDevices(availableDevices)
        setSelectedDevice(configuredDevice)
        const activeDevice =
          availableDevices.find((device) => device.name === configuredDevice) ??
          availableDevices.find((device) => device.is_default) ??
          availableDevices[0]
        setDetail(
          status.available
            ? `${status.device_count} input device${status.device_count === 1 ? "" : "s"}${activeDevice ? ` · ${activeDevice.name}` : ""}`
            : "No microphone devices detected."
        )
      } else {
        setMicrophone(null)
        setDevices([])
        setSelectedDevice(null)
        setDetail("Browser microphone access is checked when you grant it.")
      }
    } catch (cause) {
      setMicrophone(null)
      setDetail(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setChecking(false)
    }
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void checkMicrophone(), 0)
    return () => window.clearTimeout(timer)
  }, [checkMicrophone])

  const grantMicrophone = async () => {
    setChecking(true)
    try {
      if (isTauri()) {
        const audio = await startAudioCapture()
        await stopAudioCapture().catch(() => null)
        setDetail(
          `Granted · ${audio.device} · ${(audio.sample_rate / 1000).toFixed(1)} kHz`
        )
        await checkMicrophone()
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        stream.getTracks().forEach((track) => track.stop())
        setDetail("Browser microphone access granted")
      }
    } catch (cause) {
      setDetail(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setChecking(false)
    }
  }

  const selectDevice = async (nextDevice: string | null) => {
    setSavingDevice(true)
    try {
      await setSelectedMicrophone(nextDevice)
      setSelectedDevice(nextDevice)
      await checkMicrophone()
    } catch (cause) {
      setDetail(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSavingDevice(false)
    }
  }

  const ready = microphone?.available ?? false
  const defaultDevice = devices.find((device) => device.is_default)
  const configuredDeviceMissing =
    selectedDevice !== null &&
    !devices.some((device) => device.name === selectedDevice)
  const microphoneOptions = [
    {
      value: null,
      label: `System default${defaultDevice ? ` · ${defaultDevice.name}` : ""}`,
    },
    ...(configuredDeviceMissing
      ? [{ value: selectedDevice, label: `${selectedDevice} (unavailable)` }]
      : []),
    ...devices.map((device) => ({
      value: device.name,
      label: `${device.name}${device.is_default ? " (system default)" : ""}`,
    })),
  ]

  return (
    <PageShell>
      <PageHeader
        title="Dictation"
        description="Choose the microphone Whisply uses for local dictation."
      />

      <Section>
        <SectionHeader
          title="Microphone access"
          description="Check that Whisply can record from the selected input."
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
              <Microphone className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-foreground">
              {checking
                ? "Checking microphone…"
                : ready
                  ? "Microphone ready"
                  : "Microphone access"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={() => void grantMicrophone()}
          >
            {ready ? "Test access" : "Grant access"}
          </Button>
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="Input device"
          description="Use the system default or choose a microphone for future dictations."
        />
        <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Microphone</p>
          <Select
            items={microphoneOptions}
            value={selectedDevice}
            disabled={!isTauri() || checking || savingDevice}
            onValueChange={(value) => void selectDevice(value as string | null)}
          >
            <SelectTrigger aria-label="Dictation microphone" className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {microphoneOptions.map((option) => (
                  <SelectItem
                    key={option.value ?? "system-default"}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {!checking && !ready ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive"
        >
          <Warning weight="fill" className="size-4" /> {detail}
        </p>
      ) : null}
    </PageShell>
  )
}
