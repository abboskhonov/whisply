import { createRoute } from "@tanstack/react-router"

import { AboutSettingsPage } from "@/pages/settings/about-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/about",
  component: AboutSettingsPage,
})
