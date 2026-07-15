import { createRoute } from "@tanstack/react-router"

import { AdvancedSettingsPage } from "@/pages/settings/advanced-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/advanced",
  component: AdvancedSettingsPage,
})
