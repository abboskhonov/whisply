import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"

import {
  checkForUpdate,
  installAppImageUpdate,
  packageUpdateDescription,
  setAvailableUpdate,
} from "@/lib/app-updater"
import { isTauri } from "@/lib/tauri"

type UpdateChannel = "app_image" | "rpm" | "deb" | "unsupported"

let updateNoticeShown = false

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
        setAvailableUpdate({ channel, update })

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
