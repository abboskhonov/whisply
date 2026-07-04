import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { router } from "@/router"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ExternalLinkGuard } from "./components/external-link-guard.tsx"
import { DebugPanel } from "./components/debug-panel.tsx"

const rootEl = document.getElementById("root")!
rootEl.removeAttribute("data-ui-scroll-container")

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <ExternalLinkGuard />
      {import.meta.env.DEV ? <DebugPanel /> : null}
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
