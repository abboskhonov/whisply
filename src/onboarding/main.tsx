import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "../index.css"
import "./onboarding.css"
import { ThemeProvider } from "@/components/theme-provider"
import { OnboardingView } from "@/components/onboarding/onboarding-view"

/*
 * Entry point for the onboarding webview (label "onboarding"). This is
 * a separate Tauri window — a small ~760×720 desktop window that floats
 * over the main app on first run and is opened later from
 * Settings → "Open wizard". Completion is written to Rust via the
 * `mark_onboarding_complete` command, which closes the window and
 * pings the main app via the `whisply://onboarding-complete` event.
 */

const rootEl = document.getElementById("root")!
createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <OnboardingView />
    </ThemeProvider>
  </StrictMode>
)
