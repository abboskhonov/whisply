import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { queryClient } from "@/lib/query-client"
import { router } from "@/router"
import { DictationQuerySynchronizer } from "@/components/dictation-query-synchronizer"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ExternalLinkGuard } from "./components/external-link-guard.tsx"
import { DebugPanel } from "./components/debug-panel.tsx"

const rootEl = document.getElementById("root")!
rootEl.removeAttribute("data-ui-scroll-container")

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DictationQuerySynchronizer />
      <ThemeProvider>
        <ExternalLinkGuard />
        {import.meta.env.DEV ? <DebugPanel /> : null}
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
