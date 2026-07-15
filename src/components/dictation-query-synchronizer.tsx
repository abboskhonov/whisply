import * as React from "react"
import { listen } from "@tauri-apps/api/event"
import { useQueryClient } from "@tanstack/react-query"

import { dictationQueryKeys } from "@/lib/dictation-queries"
import { isTauri } from "@/lib/tauri"

export function DictationQuerySynchronizer() {
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!isTauri()) return

    let active = true
    let unlisten: (() => void) | undefined

    void listen("whisply://dictation-result", () => {
      void queryClient.invalidateQueries({
        queryKey: dictationQueryKeys.root,
      })
    }).then((stopListening) => {
      if (active) {
        unlisten = stopListening
      } else {
        stopListening()
      }
    })

    return () => {
      active = false
      unlisten?.()
    }
  }, [queryClient])

  return null
}
