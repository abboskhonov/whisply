import { createRoute } from "@tanstack/react-router"

import { PlaygroundSettingsPage } from "@/pages/settings/playground-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/playground",
  component: PlaygroundSettingsPage,
})
