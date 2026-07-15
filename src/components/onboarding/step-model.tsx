import * as React from "react"
import {
  Check,
  Cpu,
  DownloadSimple,
  GlobeHemisphereWest,
  Warning,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  cancelSpeechModelDownload,
  downloadSpeechModel,
  listSpeechModels,
  listenToModelDownload,
  selectSpeechModel,
  type ModelDownloadProgress,
  type SpeechModel,
} from "@/lib/models"

type StepModelProps = {
  onNext: () => void
  onBack: () => void
}

const RECOMMENDED_MODEL_ID = "parakeet-tdt-0.6b-v3-int8"

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function isDownloadActive(progress: ModelDownloadProgress | null) {
  return Boolean(
    progress &&
      ["downloading", "extracting", "verifying"].includes(progress.stage)
  )
}

export function StepModel({ onNext, onBack }: StepModelProps) {
  const [models, setModels] = React.useState<SpeechModel[]>([])
  const [selectedId, setSelectedId] = React.useState(RECOMMENDED_MODEL_ID)
  const [progress, setProgress] = React.useState<ModelDownloadProgress | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refreshModels = React.useCallback(async () => {
    const available = await listSpeechModels()
    setModels(available)
    const selected = available.find((model) => model.selected)
    if (selected) setSelectedId(selected.id)
    return available
  }, [])

  React.useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined

    listenToModelDownload((next) => {
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
      .catch((reason) => {
        if (mounted) setError(String(reason))
      })

    const loadTimer = window.setTimeout(() => {
      refreshModels()
        .catch((reason) => {
          if (mounted) setError(String(reason))
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    }, 0)

    return () => {
      mounted = false
      window.clearTimeout(loadTimer)
      unsubscribe?.()
    }
  }, [refreshModels])

  const selectedModel = models.find((model) => model.id === selectedId)
  const downloadActive = isDownloadActive(progress)

  const handlePrimary = async () => {
    if (!selectedModel) return
    setError(null)

    try {
      if (selectedModel.installed) {
        await selectSpeechModel(selectedModel.id)
        onNext()
        return
      }

      setProgress({
        model_id: selectedModel.id,
        stage: "downloading",
        bytes_downloaded: 0,
        total_bytes: selectedModel.download_size_bytes,
        percent: 0,
        message: "Starting download…",
      })
      await downloadSpeechModel(selectedModel.id)
    } catch (reason) {
      setProgress(null)
      setError(String(reason))
    }
  }

  const handleCancel = async () => {
    await cancelSpeechModelDownload()
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Cpu weight="regular" className="size-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Choose your speech model
        </h2>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          Whisply transcribes locally. Download one model now—audio never
          leaves this computer.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <GlobeHemisphereWest
            weight="regular"
            className="size-4 text-muted-foreground"
          />
          <h3 className="text-[13px] font-semibold text-foreground">
            Parakeet 0.6B · CPU optimized
          </h3>
        </div>

        <ul
          role="radiogroup"
          aria-label="Speech model"
          className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40"
        >
          {loading ? (
            <li className="px-4 py-5 text-center text-sm text-muted-foreground">
              Checking installed models…
            </li>
          ) : (
            models.map((model) => {
              const selected = model.id === selectedId
              return (
                <li key={model.id}>
                  <label
                    className={cn(
                      "flex items-start gap-3 px-4 py-3.5 transition-colors",
                      downloadActive
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer hover:bg-muted/40",
                      selected && "bg-primary/[0.04]"
                    )}
                  >
                    <input
                      type="radio"
                      name="speech-model"
                      value={model.id}
                      checked={selected}
                      disabled={downloadActive}
                      onChange={() => {
                        setSelectedId(model.id)
                        setProgress(null)
                        setError(null)
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2",
                        selected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/40 bg-background"
                      )}
                    >
                      {selected ? (
                        <span className="size-1.5 rounded-full bg-primary-foreground" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-medium text-foreground">
                          {model.name}
                        </p>
                        {model.id === RECOMMENDED_MODEL_ID ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                            Recommended
                          </span>
                        ) : null}
                        {model.installed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-success">
                            <Check weight="bold" className="size-3" />
                            Installed
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {model.description}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                        {model.languages} · {formatBytes(model.download_size_bytes)} download · about 640 MB installed
                      </p>
                    </div>
                  </label>
                </li>
              )
            })
          )}
        </ul>
      </div>

      {progress && progress.model_id === selectedId ? (
        <div className="space-y-2.5 rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-foreground">{progress.message}</span>
            <span className="tabular-nums text-muted-foreground">
              {progress.stage === "downloading"
                ? `${progress.percent.toFixed(0)}%`
                : progress.stage === "ready"
                  ? "Ready"
                  : "Please wait"}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Model download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.percent)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width] duration-200",
                progress.stage !== "downloading" &&
                  progress.stage !== "ready" &&
                  "animate-pulse"
              )}
              style={{
                width: `${progress.stage === "ready" ? 100 : Math.max(2, progress.percent)}%`,
              }}
            />
          </div>
          {progress.stage === "downloading" ? (
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(progress.bytes_downloaded)} of {formatBytes(progress.total_bytes)}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          <Warning weight="fill" className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/70">
        Models are open source and run through sherpa-onnx. NVIDIA Parakeet is
        licensed under CC BY 4.0.
      </p>

      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={downloadActive}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {downloadActive ? (
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            onClick={handlePrimary}
            disabled={loading || !selectedModel || downloadActive}
          >
            {selectedModel?.installed ? (
              <>
                <Check weight="bold" className="size-3.5" />
                Continue
              </>
            ) : (
              <>
                <DownloadSimple weight="bold" className="size-3.5" />
                Download model
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
