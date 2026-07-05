import { createRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/pages/settings-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  component: SettingsPage,
})
