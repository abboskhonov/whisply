import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { trackedInvoke } from "@/lib/tauri"

export type SpeechModel = {
  id: string
  name: string
  description: string
  languages: string
  download_size_bytes: number
  installed: boolean
  selected: boolean
}

export type ModelDownloadStage =
  | "downloading"
  | "extracting"
  | "verifying"
  | "ready"
  | "cancelled"
  | "error"

export type ModelDownloadProgress = {
  model_id: string
  stage: ModelDownloadStage
  bytes_downloaded: number
  total_bytes: number
  percent: number
  message: string
}

export function listSpeechModels() {
  return trackedInvoke<SpeechModel[]>("list_models")
}

export function downloadSpeechModel(modelId: string) {
  return trackedInvoke<void>("download_model", { modelId })
}

export function cancelSpeechModelDownload() {
  return trackedInvoke<void>("cancel_model_download")
}

export function selectSpeechModel(modelId: string) {
  return trackedInvoke<void>("select_model", { modelId })
}

export function listenToModelDownload(
  callback: (progress: ModelDownloadProgress) => void
): Promise<UnlistenFn> {
  return listen<ModelDownloadProgress>(
    "whisply://model-download-progress",
    (event) => callback(event.payload)
  )
}
