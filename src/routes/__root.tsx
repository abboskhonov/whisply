import { createRootRoute, Outlet } from "@tanstack/react-router"

import { Layout } from "@/components/app-shell"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  // The onboarding wizard runs in its own Tauri webview now, so the
  // main window always renders inside the normal app shell. There's no
  // /onboarding route anymore — the wizard window is opened by Rust
  // (on first launch) or via Settings → "Open wizard".
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
