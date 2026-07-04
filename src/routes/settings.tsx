import { createRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/pages/settings-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
})
