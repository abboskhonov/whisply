import * as React from "react"
import { Check, DownloadSimple, Warning } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  PageHeader,
  PageShell,
  Section,
  SectionHeader,
} from "@/components/page"
import {
  cancelSpeechModelDownload,
  downloadSpeechModel,
  listSpeechModels,
  listenToModelDownload,
  selectSpeechModel,
  type ModelDownloadProgress,
  type SpeechModel,
} from "@/lib/models"
import { cn } from "@/lib/utils"

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

export function ModelsSettingsPage() {
  const [models, setModels] = React.useState<SpeechModel[]>([])
  const [selectedId, setSelectedId] = React.useState("")
  const [progress, setProgress] = React.useState<ModelDownloadProgress | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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
      void refreshModels()
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
        <SectionHeader
          title="Speech model"
          description="Models run locally; downloading a model also makes it active."
        />
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
                      onChange={() => void chooseModel(model)}
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
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium text-foreground">
                          {model.name}
                        </span>
                        {model.id === RECOMMENDED_MODEL_ID ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-primary uppercase">
                            Recommended
                          </span>
                        ) : null}
                        {model.selected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wider text-success uppercase">
                            <Check weight="bold" className="size-3" /> Active
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {model.description}
                      </span>
                      <span className="mt-1.5 block text-[11px] text-muted-foreground/70">
                        {model.languages} ·{" "}
                        {formatBytes(model.download_size_bytes)} download
                        {model.installed ? " · installed" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>

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
