import { createRoute } from "@tanstack/react-router"

import { ModelsSettingsPage } from "@/pages/settings/models-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/models",
  component: ModelsSettingsPage,
})
