import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import type { Update } from "@tauri-apps/plugin-updater"
import { toast } from "sonner"

import { isTauri } from "@/lib/tauri"

type UpdateChannel = "app_image" | "rpm" | "deb" | "unsupported"

let updateCheck: Promise<Update | null> | undefined
let updateNoticeShown = false

function checkForUpdate() {
  updateCheck ??= import("@tauri-apps/plugin-updater")
    .then(({ check }) => check({ timeout: 10_000 }))
    .catch((error) => {
      updateCheck = undefined
      throw error
    })
  return updateCheck
}

function packageUpdateDescription(channel: UpdateChannel) {
  return channel === "rpm"
    ? "Download the latest RPM from GitHub Releases until the Whisply COPR repository is available."
    : "Download the latest DEB from GitHub Releases until the Whisply Ubuntu repository is available."
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

export function AppUpdater() {
  React.useEffect(() => {
    if (!isTauri()) {
      return
    }

    let cancelled = false

    async function notifyAboutUpdate() {
      try {
        const channel = await invoke<UpdateChannel>("get_update_channel")
        if (channel === "unsupported") {
          return
        }

        const update = await checkForUpdate()
        if (!update) {
          return
        }
        if (cancelled || updateNoticeShown) {
          await update.close()
          return
        }
        updateNoticeShown = true

        if (channel === "app_image") {
          toast("Whisply update available", {
            description: `Version ${update.version} is ready to install.`,
            action: {
              label: "Download",
              onClick: () => void installAppImageUpdate(update),
            },
          })
          return
        }

        toast("Whisply update available", {
          description: packageUpdateDescription(channel),
        })
        await update.close()
      } catch (error) {
        console.warn("Could not check for updates:", error)
      }
    }

    void notifyAboutUpdate()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
