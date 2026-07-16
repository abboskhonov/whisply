import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { invoke } from "@tauri-apps/api/core"

import "./index.css"
import { overlayPosition } from "@/lib/preferences"
import { queryClient } from "@/lib/query-client"
import { isTauri } from "@/lib/tauri"
import { router } from "@/router"
import { DictationQuerySynchronizer } from "@/components/dictation-query-synchronizer"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ExternalLinkGuard } from "./components/external-link-guard.tsx"
import { DebugPanel } from "./components/debug-panel.tsx"
import { AppUpdater } from "@/components/app-updater"
import { Toaster } from "@/components/ui/sonner"

const rootEl = document.getElementById("root")!
rootEl.removeAttribute("data-ui-scroll-container")

if (isTauri()) {
  void invoke("set_overlay_position", { position: overlayPosition() }).catch(
    (cause) => console.error("Failed to restore overlay position:", cause)
  )
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DictationQuerySynchronizer />
      <ThemeProvider>
        <ExternalLinkGuard />
        <AppUpdater />
        <Toaster position="bottom-right" richColors />
        {import.meta.env.DEV ? <DebugPanel /> : null}
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
