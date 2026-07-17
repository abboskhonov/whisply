import { invoke } from "@tauri-apps/api/core"
import type { Update } from "@tauri-apps/plugin-updater"
import { toast } from "sonner"

import { isTauri } from "@/lib/tauri"

type UpdateChannel = "app_image" | "rpm" | "deb" | "unsupported"

type AvailableUpdate = {
  channel: Exclude<UpdateChannel, "unsupported">
  update: Update
}

const RELEASES_URL = "https://github.com/abboskhonov/whisply/releases"

let updateCheck: Promise<Update | null> | undefined
let availableUpdate: AvailableUpdate | null = null
const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

function packageUpdateDescription(channel: UpdateChannel) {
  return channel === "rpm"
    ? "Download the latest RPM from GitHub Releases until the Whisply COPR repository is available."
    : "Download the latest DEB from GitHub Releases until the Whisply Ubuntu repository is available."
}

async function checkForUpdate(refresh = false) {
  if (refresh) {
    const { check } = await import("@tauri-apps/plugin-updater")
    return check({ timeout: 10_000 })
  }

  updateCheck ??= import("@tauri-apps/plugin-updater")
    .then(({ check }) => check({ timeout: 10_000 }))
    .catch((error) => {
      updateCheck = undefined
      throw error
    })
  return updateCheck
}

async function installAppImageUpdate(update: Update) {
  const toastId = toast.loading("Downloading Whisply update…")

  try {
    await update.downloadAndInstall()
    toast.success("Update installed. Restarting Whisply…", { id: toastId })
    const { relaunch } = await import("@tauri-apps/plugin-process")
    await relaunch()
  } catch (error) {
    toast.error("Couldn’t install the update", {
      id: toastId,
      description: error instanceof Error ? error.message : String(error),
    })
  } finally {
    await update.close()
  }
}

export function getAvailableUpdate() {
  return availableUpdate
}

export function subscribeToAvailableUpdate(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setAvailableUpdate(next: AvailableUpdate | null) {
  availableUpdate = next
  notifyListeners()
}

export async function checkForUpdates() {
  if (!isTauri()) {
    toast.error("Update checks are only available in the desktop app.")
    return
  }

  try {
    const channel = await invoke<UpdateChannel>("get_update_channel")
    if (channel === "unsupported") {
      toast("Updates aren't available for this installation.")
      return
    }

    const update = await checkForUpdate(true)
    if (!update) {
      toast.success("Whisply is up to date.")
      return
    }

    setAvailableUpdate({ channel, update })
    toast("Whisply update available", {
      description:
        channel === "app_image"
          ? `Version ${update.version} is ready to install.`
          : packageUpdateDescription(channel),
    })
  } catch (error) {
    toast.error("Couldn’t check for updates", {
      description: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function installAvailableUpdate() {
  const currentUpdate = availableUpdate
  if (!currentUpdate) return

  if (currentUpdate.channel === "app_image") {
    await installAppImageUpdate(currentUpdate.update)
    setAvailableUpdate(null)
    return
  }

  await currentUpdate.update.close()
  setAvailableUpdate(null)
  const { openUrl } = await import("@tauri-apps/plugin-opener")
  await openUrl(RELEASES_URL)
}

export { checkForUpdate, installAppImageUpdate, packageUpdateDescription }
