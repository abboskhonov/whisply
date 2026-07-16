import * as React from "react"
import {
  ArrowSquareOut,
  Check,
  DownloadSimple,
  Globe,
  Info,
  Warning,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  cancelSpeechModelDownload,
  downloadSpeechModel,
  getModelMemorySettings,
  listSpeechModels,
  listenToModelDownload,
  selectSpeechModel,
  setModelMemorySettings,
  type ModelDownloadProgress,
  type ModelMemorySettings,
  type SpeechModel,
} from "@/lib/models"
import { cn } from "@/lib/utils"

const RECOMMENDED_MODEL_ID = "parakeet-tdt-0.6b-v3-int8"
const MODEL_UNLOAD_OPTIONS = [
  { value: "0", label: "Immediately" },
  { value: "1", label: "1 minute" },
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
]

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function isDownloadActive(progress: ModelDownloadProgress | null) {
  return Boolean(
    progress &&
    ["downloading", "extracting", "verifying"].includes(progress.stage)
  )
}

function modelPerformance(model: SpeechModel) {
  if (model.id === "parakeet-tdt-0.6b-v2-int8") {
    return { accuracy: 5, speed: 5 }
  }
  if (model.id === "gigaam-multilingual-ctc-int8") {
    return { accuracy: 4, speed: 4 }
  }
  return { accuracy: 5, speed: 4 }
}

function ModelCard({
  model,
  selected,
  disabled,
  onSelect,
  onDetails,
}: {
  model: SpeechModel
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onDetails: () => void
}) {
  const performance = modelPerformance(model)

  return (
    <li className="relative">
      <label
        className={cn(
          "group flex cursor-pointer flex-col gap-4 rounded-xl border bg-card px-5 py-4 pr-24 transition-colors sm:flex-row sm:items-start sm:gap-6 sm:pb-12",
          selected ? "border-primary/50 bg-primary/[0.035]" : "border-border hover:bg-muted/35",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          type="radio"
          name="speech-model"
          value={model.id}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="sr-only"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground">
              {model.name}
            </span>
            {model.selected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                <Check weight="bold" className="size-3" /> Active
              </span>
            ) : model.id === RECOMMENDED_MODEL_ID ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Recommended
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {model.description}
          </span>
        </span>

        <span className="flex w-28 shrink-0 flex-col gap-2 pt-0.5 text-[11px] text-muted-foreground">
          {[
            ["Accuracy", performance.accuracy],
            ["Speed", performance.speed],
          ].map(([label, score]) => (
            <span key={label as string} className="flex items-center gap-2">
              <span className="w-11 text-right">{label}</span>
              <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="rounded-full bg-primary/70"
                  style={{ width: `${(score as number) * 20}%` }}
                />
              </span>
            </span>
          ))}
        </span>

        <span className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground sm:absolute sm:right-5 sm:bottom-4 sm:border-0 sm:pt-0">
          <Globe className="size-3.5" />
          {model.languages}
          <span aria-hidden>·</span>
          {formatBytes(model.download_size_bytes)}
          {model.installed ? " installed" : " download"}
        </span>
      </label>
      <Button
        variant="ghost"
        size="xs"
        className="absolute top-3 right-3"
        onClick={onDetails}
        aria-label={`View details for ${model.name}`}
      >
        <Info data-icon="inline-start" />
        Details
      </Button>
    </li>
  )
}

function ModelDetailsDialog({
  model,
  onOpenChange,
}: {
  model: SpeechModel | null
  onOpenChange: (open: boolean) => void
}) {
  if (!model) return null

  return (
    <Dialog open={Boolean(model)} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6 p-6 sm:max-w-2xl">
        <DialogHeader className="gap-2 pr-8">
          <DialogTitle className="text-xl tracking-tight">{model.name}</DialogTitle>
          <DialogDescription className="max-w-lg leading-6">
            {model.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border/60 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{model.parameters} parameters</span>
          <span aria-hidden>·</span>
          <span>{model.architecture}</span>
          <span aria-hidden>·</span>
          <span>{model.license}</span>
          <span aria-hidden>·</span>
          <span>{formatBytes(model.download_size_bytes)} download</span>
        </div>

        <div className="grid gap-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Published by</p>
            <p className="text-base font-medium text-foreground">{model.owner}</p>
            <a
              href={model.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-blue-600 underline-offset-4 transition-colors hover:text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-blue-400 dark:hover:text-blue-300"
            >
              See on Hugging Face
              <ArrowSquareOut className="size-3.5" />
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Language coverage</p>
            <p className="text-sm leading-6 text-foreground">{model.languages}</p>
          </div>
        </div>

        <p className="border-t border-border/60 pt-4 text-sm leading-6 text-muted-foreground">
          Whisply downloads an optimized local runtime copy. Your audio stays on
          this device and is never sent to the model publisher.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function ModelsSettingsPage() {
  const [models, setModels] = React.useState<SpeechModel[]>([])
  const [selectedId, setSelectedId] = React.useState("")
  const [progress, setProgress] = React.useState<ModelDownloadProgress | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [memorySettings, setMemorySettings] =
    React.useState<ModelMemorySettings | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [detailModel, setDetailModel] = React.useState<SpeechModel | null>(null)

  const refreshModels = React.useCallback(async () => {
    const available = await listSpeechModels()
    setModels(available)
    setSelectedId(
      available.find((model) => model.selected)?.id ?? available[0]?.id ?? ""
    )
  }, [])

  React.useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined

    const loadTimer = window.setTimeout(() => {
      void Promise.all([
        refreshModels(),
        getModelMemorySettings().then(setMemorySettings),
      ])
        .catch((cause) => {
          if (mounted)
            setError(cause instanceof Error ? cause.message : String(cause))
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    }, 0)

    void listenToModelDownload((next) => {
      if (!mounted) return
      setProgress(next)
      if (next.stage === "error") setError(next.message)
      if (next.stage === "cancelled") setProgress(null)
      if (next.stage === "ready") {
        setError(null)
        void refreshModels()
      }
    })
      .then((cleanup) => {
        if (mounted) unsubscribe = cleanup
        else cleanup()
      })
      .catch((cause) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })

    return () => {
      mounted = false
      window.clearTimeout(loadTimer)
      unsubscribe?.()
    }
  }, [refreshModels])

  const selectedModel = models.find((model) => model.id === selectedId)
  const downloadedModels = models.filter((model) => model.installed)
  const availableModels = models.filter((model) => !model.installed)
  const downloadActive = isDownloadActive(progress)

  const chooseModel = async (model: SpeechModel) => {
    if (downloadActive) return
    setSelectedId(model.id)
    setError(null)
    if (!model.installed) return

    try {
      await selectSpeechModel(model.id)
      await refreshModels()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const updateMemorySettings = async (
    next: ModelMemorySettings
  ) => {
    setMemorySettings(next)
    setError(null)
    try {
      setMemorySettings(await setModelMemorySettings(next))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      void getModelMemorySettings().then(setMemorySettings)
    }
  }

  const downloadSelectedModel = async () => {
    if (!selectedModel || selectedModel.installed) return
    setError(null)
    setProgress({
      model_id: selectedModel.id,
      stage: "downloading",
      bytes_downloaded: 0,
      total_bytes: selectedModel.download_size_bytes,
      percent: 0,
      message: "Starting download…",
    })
    try {
      await downloadSpeechModel(selectedModel.id)
    } catch (cause) {
      setProgress(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Models"
        description="Choose the local speech model that transcribes your dictation."
      />

      <Section>
        {loading ? (
          <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Checking installed models…
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {downloadedModels.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="px-1 text-sm font-medium text-muted-foreground">
                  Downloaded models
                </p>
                <ul role="radiogroup" aria-label="Downloaded speech models" className="flex flex-col gap-3">
                  {downloadedModels.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      selected={model.id === selectedId}
                      disabled={downloadActive}
                      onSelect={() => void chooseModel(model)}
                      onDetails={() => setDetailModel(model)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {availableModels.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="px-1 text-sm font-medium text-muted-foreground">
                  Available to download
                </p>
                <ul role="radiogroup" aria-label="Available speech models" className="flex flex-col gap-3">
                  {availableModels.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      selected={model.id === selectedId}
                      disabled={downloadActive}
                      onSelect={() => void chooseModel(model)}
                      onDetails={() => setDetailModel(model)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {progress && progress.model_id === selectedId ? (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-card/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-foreground">
                {progress.message}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {progress.stage === "downloading"
                  ? `${progress.percent.toFixed(0)}%`
                  : "Please wait"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.max(2, progress.percent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">
                {progress.stage === "downloading"
                  ? `${formatBytes(progress.bytes_downloaded)} of ${formatBytes(progress.total_bytes)}`
                  : "Installing locally"}
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void cancelSpeechModelDownload()}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {!downloadActive && selectedModel && !selectedModel.installed ? (
          <div className="flex justify-end">
            <Button onClick={() => void downloadSelectedModel()}>
              <DownloadSimple weight="bold" className="size-3.5" />
              Download {selectedModel.name}
            </Button>
          </div>
        ) : null}
      </Section>

      <Section>
        <SectionHeader
          title="Model memory"
          description="Keep the speech model ready between dictations to avoid reload time."
        />
        {memorySettings ? (
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Keep model loaded
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Keep it in RAM until Whisply quits. This uses substantially more memory.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Keep speech model loaded until Whisply quits"
                aria-checked={memorySettings.keep_loaded}
                data-state={memorySettings.keep_loaded ? "on" : "off"}
                onClick={() =>
                  void updateMemorySettings({
                    ...memorySettings,
                    keep_loaded: !memorySettings.keep_loaded,
                  })
                }
                className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-muted p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none data-[state=on]:bg-primary"
              >
                <span
                  data-state={memorySettings.keep_loaded ? "on" : "off"}
                  className="size-5 rounded-full bg-background shadow-xs transition-transform data-[state=on]:translate-x-4"
                />
              </button>
            </div>
            <div className="flex items-center gap-4 border-t border-border/60 px-5 py-4">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="model-unload-delay"
                  className="text-sm font-medium text-foreground"
                >
                  Unload after inactivity
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The timer resets after each completed dictation.
                </p>
              </div>
              <Select
                items={MODEL_UNLOAD_OPTIONS}
                value={String(memorySettings.unload_after_minutes)}
                disabled={memorySettings.keep_loaded}
                onValueChange={(value) => {
                  if (value === null) return
                  void updateMemorySettings({
                    ...memorySettings,
                    unload_after_minutes: Number(value),
                  })
                }}
              >
                <SelectTrigger
                  id="model-unload-delay"
                  aria-label="Unload model after inactivity"
                  className="w-32 shrink-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {MODEL_UNLOAD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-card/40 px-5 py-4 text-sm text-muted-foreground">
            Loading model memory settings…
          </div>
        )}
      </Section>

      <ModelDetailsDialog
        model={detailModel}
        onOpenChange={(open) => {
          if (!open) setDetailModel(null)
        }}
      />

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
