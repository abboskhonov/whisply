import { createRoute } from "@tanstack/react-router"

import { SettingsSubPage } from "@/pages/settings-sub-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/shortcut",
  component: () => (
    <SettingsSubPage
      title="Shortcut"
      description="Hotkeys for start, stop, and modes."
    />
  ),
})
