import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { OverlayApp } from "./App"

const rootEl = document.getElementById("root")!
createRoot(rootEl).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>
)
