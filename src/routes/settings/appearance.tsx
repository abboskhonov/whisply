import { createRoute } from "@tanstack/react-router"

import { AppearanceSettingsPage } from "@/pages/settings/appearance-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/appearance",
  component: AppearanceSettingsPage,
})
